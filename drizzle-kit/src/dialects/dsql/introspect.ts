import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import type { DB } from '../../utils';
import { splitExpressions, trimChar } from '../../utils';
import type {
	CheckConstraint,
	ForeignKey,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
	ViewColumn,
} from '../postgres/ddl';
import {
	defaultForColumn,
	isSerialExpression,
	isSystemNamespace,
	parseOnType,
	parseViewDefinition,
} from '../postgres/grammar';
import type { EntityFilter } from '../pull-utils';
import { filterMigrationsSchema } from '../utils';

/**
 * Introspects a DSQL database and returns the schema.
 *
 * DSQL is PostgreSQL-compatible, so we use pg_catalog system tables.
 * DSQL supports JSON runtime functions but not JSON as column data types,
 * so we cast JSON results to ::text and parse them in JavaScript.
 *
 * DSQL limitations:
 * - No enums (uses text/varchar instead)
 * - No sequences (uses UUID with gen_random_uuid())
 * - No policies/RLS
 * - No foreign keys
 * - Only btree indexes (no hash, gin, gist, etc.)
 */
export const fromDatabase = async (
	db: DB,
	filter: EntityFilter = () => true,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	queryCallback: (
		id: string,
		rows: Record<string, unknown>[],
		error: Error | null,
	) => void = () => {},
): Promise<InterimSchema> => {
	const schemas: Schema[] = [];
	const tables: { entityType: 'tables'; schema: string; name: string; isRlsEnabled: boolean }[] = [];
	const columns: InterimColumn[] = [];
	const indexes: InterimIndex[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const views: View[] = [];
	const viewColumns: ViewColumn[] = [];

	type Namespace = {
		oid: number | string;
		name: string;
	};

	// Query namespaces
	const namespaces = await db.query<Namespace>(
		'SELECT oid, nspname as name FROM pg_catalog.pg_namespace ORDER BY pg_catalog.lower(nspname)',
	).then((rows) => {
		queryCallback('namespaces', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('namespaces', [], err);
		throw err;
	});

	const { other: filteredNamespaces } = namespaces.reduce<{ system: Namespace[]; other: Namespace[] }>(
		(acc, it) => {
			if (isSystemNamespace(it.name)) {
				acc.system.push(it);
			} else {
				acc.other.push(it);
			}
			return acc;
		},
		{ system: [], other: [] },
	);

	// Escape single quotes to prevent SQL injection
	const filteredNamespacesStringForSQL = filteredNamespaces.map((ns) => `'${ns.name.replace(/'/g, "''")}'`).join(',');
	schemas.push(...filteredNamespaces.map<Schema>((it) => ({ entityType: 'schemas', name: it.name })));

	if (!filteredNamespacesStringForSQL) {
		return {
			schemas,
			tables,
			enums: [],
			columns,
			indexes,
			pks,
			fks,
			uniques,
			checks,
			sequences: [],
			roles: [],
			privileges: [],
			policies: [],
			views,
			viewColumns,
		};
	}

	// Query defaults
	const defaultsList = await db.query<{
		tableId: number | string;
		ordinality: number;
		expression: string;
	}>(`
		SELECT
			adrelid AS "tableId",
			adnum AS "ordinality",
			pg_catalog.pg_get_expr(adbin, adrelid) AS "expression"
		FROM
			pg_catalog.pg_attrdef;
	`).then((rows) => {
		queryCallback('defaults', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('defaults', [], err);
		throw err;
	});

	// Query tables
	type TableListItem = {
		oid: number | string;
		schema: string;
		name: string;
		kind: 'r' | 'p' | 'v' | 'm';
		options: string[] | null;
		definition: string | null;
	};

	const tablesList = await db.query<TableListItem>(`
		SELECT
			pg_class.oid,
			nspname as "schema",
			relname AS "name",
			relkind AS "kind",
			reloptions::text[] as "options",
			CASE
				WHEN relkind OPERATOR(pg_catalog.=) 'v' OR relkind OPERATOR(pg_catalog.=) 'm'
					THEN pg_catalog.pg_get_viewdef(pg_class.oid, true)
				ELSE null
			END as "definition"
		FROM
			pg_catalog.pg_class
		JOIN pg_catalog.pg_namespace ON pg_namespace.oid OPERATOR(pg_catalog.=) relnamespace
		WHERE
			relkind IN ('r', 'p', 'v', 'm')
			AND nspname IN (${filteredNamespacesStringForSQL})
		ORDER BY pg_catalog.lower(nspname), pg_catalog.lower(relname);
	`).then((rows) => {
		queryCallback('tables', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('tables', [], err);
		throw err;
	});

	const viewsList = tablesList.filter((it) => {
		it.schema = trimChar(it.schema, '"');
		return it.kind === 'v' || it.kind === 'm';
	});

	const filteredTables = tablesList.filter((it) => {
		it.schema = trimChar(it.schema, '"');
		return it.kind === 'r' || it.kind === 'p';
	});

	const filteredTableIds = filteredTables.map((it) => it.oid);
	const viewsIds = viewsList.map((it) => it.oid);
	const filteredViewsAndTableIds = [...filteredTableIds, ...viewsIds];

	const filterByTableIds = filteredTableIds.length > 0 ? `(${filteredTableIds.join(',')})` : '';
	const filterByTableAndViewIds = filteredViewsAndTableIds.length > 0 ? `(${filteredViewsAndTableIds.join(',')})` : '';

	for (const table of filteredTables) {
		tables.push({
			entityType: 'tables',
			schema: trimChar(table.schema, "'"),
			name: table.name,
			isRlsEnabled: false, // DSQL doesn't support RLS
		});
	}

	// Query serials
	const serialsList = await db.query<{
		oid: number | string;
		tableId: number | string;
		ordinality: number;
		expression: string;
	}>(`SELECT
			oid,
			adrelid as "tableId",
			adnum as "ordinality",
			pg_catalog.pg_get_expr(adbin, adrelid) as "expression"
		FROM
			pg_catalog.pg_attrdef
		WHERE ${filterByTableIds ? ` adrelid IN ${filterByTableIds}` : 'false'}
	`).then((rows) => {
		queryCallback('serials', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('serials', [], err);
		throw err;
	});

	// Query constraints
	const constraintsList = await db.query<{
		oid: number | string;
		schemaId: number | string;
		tableId: number | string;
		name: string;
		type: 'p' | 'u' | 'f' | 'c';
		definition: string;
		indexId: number | string;
		columnsOrdinals: number[];
		tableToId: number | string;
		columnsToOrdinals: number[];
		onUpdate: 'a' | 'd' | 'r' | 'c' | 'n';
		onDelete: 'a' | 'd' | 'r' | 'c' | 'n';
	}>(`
		SELECT
			oid,
			connamespace AS "schemaId",
			conrelid AS "tableId",
			conname AS "name",
			contype AS "type",
			pg_catalog.pg_get_constraintdef(oid) AS "definition",
			conindid AS "indexId",
			conkey AS "columnsOrdinals",
			confrelid AS "tableToId",
			confkey AS "columnsToOrdinals",
			confupdtype AS "onUpdate",
			confdeltype AS "onDelete"
		FROM
			pg_catalog.pg_constraint
		WHERE ${filterByTableIds ? ` conrelid IN ${filterByTableIds}` : 'false'}
		ORDER BY conrelid, contype, pg_catalog.lower(conname);
	`).then((rows) => {
		queryCallback('constraints', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('constraints', [], err);
		throw err;
	});

	// Query columns (without JSON for identity - DSQL doesn't support identity columns anyway)
	const columnsList = await db.query<{
		tableId: number | string;
		kind: 'r' | 'p' | 'v' | 'm';
		name: string;
		ordinality: number;
		notNull: boolean;
		type: string;
		dimensions: number;
		typeId: number | string;
		generatedType: 's' | '';
	}>(`SELECT
			attrelid AS "tableId",
			relkind AS "kind",
			attname AS "name",
			attnum AS "ordinality",
			attnotnull AS "notNull",
			CASE
        		WHEN attndims > 0 THEN attndims
        		WHEN t.typcategory = 'A' THEN 1
        		ELSE 0
    		END as "dimensions",
			atttypid as "typeId",
			attgenerated as "generatedType",
			pg_catalog.format_type(atttypid, atttypmod) as "type"
		FROM
			pg_catalog.pg_attribute attr
			JOIN pg_catalog.pg_class cls ON cls.oid OPERATOR(pg_catalog.=) attr.attrelid
			JOIN pg_catalog.pg_namespace nsp ON nsp.oid OPERATOR(pg_catalog.=) cls.relnamespace
			JOIN pg_catalog.pg_type t ON t.oid OPERATOR(pg_catalog.=) attr.atttypid
		WHERE
		${filterByTableAndViewIds ? ` attrelid IN ${filterByTableAndViewIds}` : 'false'}
			AND attnum OPERATOR(pg_catalog.>) 0
			AND attisdropped OPERATOR(pg_catalog.=) FALSE
		ORDER BY attrelid, attnum;
	`).then((rows) => {
		queryCallback('columns', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('columns', [], err);
		throw err;
	});

	// Query indexes with JSON cast to text
	// DSQL supports JSON runtime functions but not JSON as column types
	// So we cast to ::text and parse in JavaScript
	const idxs = await db.query<{
		oid: number | string;
		schema: string;
		name: string;
		accessMethod: string;
		with?: string[];
		metadataJson: string; // JSON cast to text
	}>(`
		SELECT
			pg_class.oid,
			nspname as "schema",
			relname AS "name",
			am.amname AS "accessMethod",
			reloptions AS "with",
			(pg_catalog.json_build_object(
				'tableId', indrelid::int,
				'expression', pg_catalog.pg_get_expr(indexprs, indrelid),
				'where', pg_catalog.pg_get_expr(indpred, indrelid),
				'columnOrdinals', indkey::int[],
				'options', indoption::int[],
				'isUnique', indisunique,
				'isPrimary', indisprimary
			))::text as "metadataJson"
		FROM
			pg_catalog.pg_class
		JOIN pg_catalog.pg_am am ON am.oid OPERATOR(pg_catalog.=) pg_class.relam
		JOIN pg_catalog.pg_namespace nsp ON nsp.oid OPERATOR(pg_catalog.=) pg_class.relnamespace
		JOIN pg_catalog.pg_index ON pg_index.indexrelid OPERATOR(pg_catalog.=) pg_class.oid
		WHERE
			relkind OPERATOR(pg_catalog.=) 'i'
			AND ${filterByTableIds ? `indrelid IN ${filterByTableIds}` : 'false'}
		ORDER BY pg_catalog.lower(nspname), pg_catalog.lower(relname);
	`).then((rows) => {
		queryCallback('indexes', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('indexes', [], err);
		throw err;
	});

	// Query opclass info separately (avoids nested JSON aggregation)
	const opclassList = await db.query<{
		indexOid: number | string;
		ordinality: number;
		opclassName: string;
		isDefault: boolean;
	}>(`
		SELECT
			pg_index.indexrelid AS "indexOid",
			opclass.ordinality::int AS "ordinality",
			pg_opclass.opcname AS "opclassName",
			pg_opclass.opcdefault AS "isDefault"
		FROM
			pg_catalog.pg_index
		CROSS JOIN LATERAL unnest(pg_index.indclass) WITH ORDINALITY AS opclass(oid, ordinality)
		JOIN pg_catalog.pg_opclass ON opclass.oid OPERATOR(pg_catalog.=) pg_opclass.oid
		WHERE ${filterByTableIds ? `pg_index.indrelid IN ${filterByTableIds}` : 'false'}
		ORDER BY pg_index.indexrelid, opclass.ordinality;
	`).then((rows) => {
		queryCallback('opclasses', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('opclasses', [], err);
		throw err;
	});

	// Build opclass lookup by index oid
	const opclassesByIndex = new Map<number, typeof opclassList>();
	for (const opc of opclassList) {
		const indexOid = Number(opc.indexOid);
		const existing = opclassesByIndex.get(indexOid) ?? [];
		existing.push(opc);
		opclassesByIndex.set(indexOid, existing);
	}

	// Supply serials to columns
	for (const column of columnsList.filter((x) => x.kind === 'r' || x.kind === 'p')) {
		const type = column.type;

		if (!(type === 'smallint' || type === 'bigint' || type === 'integer')) {
			continue;
		}

		const expr = serialsList.find(
			(it) => Number(it.tableId) === Number(column.tableId) && it.ordinality === column.ordinality,
		);

		if (expr) {
			const table = tablesList.find((it) => Number(it.oid) === Number(column.tableId))!;
			const isSerial = isSerialExpression(expr.expression, table.schema);
			column.type = isSerial ? type === 'bigint' ? 'bigserial' : type === 'integer' ? 'serial' : 'smallserial' : type;
		}
	}

	// Process columns
	for (const column of columnsList.filter((x) => x.kind === 'r' || x.kind === 'p')) {
		const table = tablesList.find((it) => Number(it.oid) === Number(column.tableId))!;

		let columnTypeMapped = column.type.replaceAll('[]', '');

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			.replace('character', 'char')
			.replace('geometry(Point', 'geometry(point');

		columnTypeMapped = trimChar(columnTypeMapped, '"');

		const columnDefault = defaultsList.find(
			(it) => Number(it.tableId) === Number(column.tableId) && it.ordinality === column.ordinality,
		);

		const defaultValue = defaultForColumn(
			columnTypeMapped,
			columnDefault?.expression,
			column.dimensions,
			false, // no enums in DSQL
		);

		const unique = constraintsList.find((it) => {
			return it.type === 'u' && Number(it.tableId) === Number(column.tableId) && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		}) ?? null;

		const pk = constraintsList.find((it) => {
			return it.type === 'p' && Number(it.tableId) === Number(column.tableId) && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		}) ?? null;

		columns.push({
			entityType: 'columns',
			schema: table.schema,
			table: table.name,
			name: column.name,
			type: columnTypeMapped,
			typeSchema: null,
			dimensions: column.dimensions,
			default: column.generatedType === 's' ? null : defaultValue,
			unique: !!unique,
			uniqueName: unique ? unique.name : null,
			uniqueNullsNotDistinct: unique?.definition.includes('NULLS NOT DISTINCT') ?? false,
			notNull: column.notNull,
			pk: pk !== null,
			pkName: pk !== null ? pk.name : null,
			generated: column.generatedType === 's'
				? { type: 'stored', as: columnDefault?.expression ?? '' }
				: null,
			identity: null, // DSQL doesn't support identity columns
		});
	}

	// Process unique constraints
	for (const unique of constraintsList.filter((it) => it.type === 'u')) {
		const table = tablesList.find((it) => Number(it.oid) === Number(unique.tableId))!;
		const schema = namespaces.find((it) => Number(it.oid) === Number(unique.schemaId))!;

		const cols = unique.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) =>
				Number(column.tableId) === Number(unique.tableId) && column.ordinality === it
			)!;
			return column.name;
		});

		uniques.push({
			entityType: 'uniques',
			schema: schema.name,
			table: table.name,
			name: unique.name,
			nameExplicit: true,
			columns: cols,
			nullsNotDistinct: unique.definition.includes('NULLS NOT DISTINCT'),
		});
	}

	// Process primary keys
	for (const pk of constraintsList.filter((it) => it.type === 'p')) {
		const table = tablesList.find((it) => Number(it.oid) === Number(pk.tableId))!;
		const schema = namespaces.find((it) => Number(it.oid) === Number(pk.schemaId))!;

		const cols = pk.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) =>
				Number(column.tableId) === Number(pk.tableId) && column.ordinality === it
			)!;
			return column.name;
		});

		pks.push({
			entityType: 'pks',
			schema: schema.name,
			table: table.name,
			name: pk.name,
			columns: cols,
			nameExplicit: true,
		});
	}

	// Process foreign keys (DSQL doesn't support FKs, but include for completeness)
	for (const fk of constraintsList.filter((it) => it.type === 'f')) {
		const table = tablesList.find((it) => Number(it.oid) === Number(fk.tableId))!;
		const schema = namespaces.find((it) => Number(it.oid) === Number(fk.schemaId))!;
		const tableTo = tablesList.find((it) => Number(it.oid) === Number(fk.tableToId))!;

		const cols = fk.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) =>
				Number(column.tableId) === Number(fk.tableId) && column.ordinality === it
			)!;
			return column.name;
		});

		const columnsTo = fk.columnsToOrdinals.map((it) => {
			const column = columnsList.find((column) =>
				Number(column.tableId) === Number(fk.tableToId) && column.ordinality === it
			)!;
			return column.name;
		});

		fks.push({
			entityType: 'fks',
			schema: schema.name,
			table: table.name,
			name: fk.name,
			nameExplicit: true,
			columns: cols,
			tableTo: tableTo.name,
			schemaTo: tableTo.schema,
			columnsTo,
			onUpdate: parseOnType(fk.onUpdate),
			onDelete: parseOnType(fk.onDelete),
		});
	}

	// Process check constraints
	for (const check of constraintsList.filter((it) => it.type === 'c')) {
		const table = tablesList.find((it) => Number(it.oid) === Number(check.tableId))!;
		const schema = namespaces.find((it) => Number(it.oid) === Number(check.schemaId))!;

		checks.push({
			entityType: 'checks',
			schema: schema.name,
			table: table.name,
			name: check.name,
			value: check.definition.startsWith('CHECK (') ? check.definition.slice(7, -1) : check.definition,
		});
	}

	// Process indexes - parse JSON metadata from text
	for (const idx of idxs) {
		// Parse the JSON metadata from text
		const metadata = JSON.parse(idx.metadataJson) as {
			tableId: number;
			expression: string | null;
			where: string | null;
			columnOrdinals: number[];
			options: number[];
			isUnique: boolean;
			isPrimary: boolean;
		};

		const forUnique = metadata.isUnique
			&& constraintsList.some((x) => x.type === 'u' && Number(x.indexId) === Number(idx.oid));
		const forPK = metadata.isPrimary
			&& constraintsList.some((x) => x.type === 'p' && Number(x.indexId) === Number(idx.oid));

		const expr = splitExpressions(metadata.expression);

		const table = tablesList.find((it) => Number(it.oid) === Number(metadata.tableId))!;

		// Get opclass info for this index
		const indexOpclasses = opclassesByIndex.get(Number(idx.oid)) ?? [];

		const opts = metadata.options.map((it) => {
			return {
				descending: (it & 1) === 1,
				nullsFirst: (it & 2) === 2,
			};
		});

		type ColumnResult = {
			type: 'expression' | 'column';
			value: string;
			options: { descending: boolean; nullsFirst: boolean };
			opclass: { name: string; default: boolean } | null;
		};

		const res: ColumnResult[] = [];
		let k = 0;
		for (let i = 0; i < metadata.columnOrdinals.length; i++) {
			const ordinal = metadata.columnOrdinals[i];
			const opclass = indexOpclasses.find((o) => o.ordinality === i + 1);

			if (ordinal === 0) {
				res.push({
					type: 'expression',
					value: expr[k] ?? '',
					options: opts[i] ?? { descending: false, nullsFirst: false },
					opclass: opclass ? { name: opclass.opclassName, default: opclass.isDefault } : null,
				});
				k += 1;
			} else {
				const column = columnsList.find((column) => {
					return Number(column.tableId) === Number(metadata.tableId) && column.ordinality === ordinal;
				});

				if (column && opts[i] && opclass) {
					res.push({
						type: 'column',
						value: column.name,
						options: opts[i],
						opclass: { name: opclass.opclassName, default: opclass.isDefault },
					});
				}
			}
		}

		const indexColumns = res.map((it) => ({
			asc: !it.options.descending,
			nullsFirst: it.options.nullsFirst,
			opclass: it.opclass && !it.opclass.default ? { name: it.opclass.name, default: it.opclass.default } : null,
			isExpression: it.type === 'expression',
			value: it.value,
		} satisfies Index['columns'][number]));

		indexes.push({
			entityType: 'indexes',
			schema: idx.schema,
			table: table.name,
			name: idx.name,
			nameExplicit: true,
			method: normalizeAccessMethod(idx.accessMethod),
			isUnique: metadata.isUnique,
			with: idx.with?.join(', ') ?? '',
			where: metadata.where,
			columns: indexColumns,
			concurrently: false,
			forUnique,
			forPK,
		});
	}

	// Process view columns
	for (const it of columnsList.filter((x) => x.kind === 'm' || x.kind === 'v')) {
		const view = viewsList.find((x) => Number(x.oid) === Number(it.tableId))!;

		const typeDimensions = it.type.split('[]').length - 1;

		let columnTypeMapped = it.type.replace('[]', '');
		columnTypeMapped = trimChar(columnTypeMapped, '"');
		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			.replace('character', 'char')
			.replace('geometry(Point)', 'geometry(point)');

		columnTypeMapped += '[]'.repeat(it.dimensions);

		viewColumns.push({
			schema: view.schema,
			view: view.name,
			name: it.name,
			type: columnTypeMapped,
			typeDimensions,
			notNull: it.notNull,
			dimensions: it.dimensions,
			typeSchema: null,
		});
	}

	// Process views
	for (const view of viewsList) {
		const definition = parseViewDefinition(view.definition);

		views.push({
			entityType: 'views',
			schema: view.schema,
			name: view.name,
			definition,
			with: null,
			materialized: view.kind === 'm',
			tablespace: null,
			using: null,
			withNoData: null,
		});
	}

	progressCallback('tables', filteredTables.length, 'done');
	progressCallback('columns', columnsList.length, 'done');
	progressCallback('checks', checks.length, 'done');
	progressCallback('indexes', indexes.length, 'done');
	progressCallback('views', viewsList.length, 'done');
	progressCallback('fks', fks.length, 'done');

	// Filter results
	const resultSchemas = schemas.filter((x) => filter({ type: 'schema', name: x.name }));
	const resultTables = tables.filter((x) => filter({ type: 'table', schema: x.schema, name: x.name }));
	const resultColumns = columns.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultIndexes = indexes.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultPKs = pks.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultFKs = fks.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultUniques = uniques.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultChecks = checks.filter((x) => resultTables.some((t) => t.schema === x.schema && t.name === x.table));
	const resultViews = views.filter((x) => filter({ type: 'table', schema: x.schema, name: x.name }));
	const resultViewColumns = viewColumns.filter((x) =>
		resultViews.some((v) => v.schema === x.schema && v.name === x.view)
	);

	return {
		schemas: resultSchemas,
		tables: resultTables,
		enums: [], // DSQL doesn't support enums
		columns: resultColumns,
		indexes: resultIndexes,
		pks: resultPKs,
		fks: resultFKs,
		uniques: resultUniques,
		checks: resultChecks,
		sequences: [], // DSQL doesn't support sequences
		roles: [], // DSQL doesn't expose roles via introspection
		privileges: [], // DSQL doesn't expose privileges via introspection
		policies: [], // DSQL doesn't support policies
		views: resultViews,
		viewColumns: resultViewColumns,
	} satisfies InterimSchema;
};

/**
 * Introspects a DSQL database for use with Drizzle schema generation.
 * Filters out public schema and auto-generated indexes.
 */
export const fromDatabaseForDrizzle = async (
	db: DB,
	filter: EntityFilter,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	migrations: {
		schema: string;
		table: string;
	},
) => {
	const res = await fromDatabase(db, filter, progressCallback);
	res.schemas = res.schemas.filter((it) => it.name !== 'public');
	res.indexes = res.indexes.filter((it) => !it.forPK && !it.forUnique);

	filterMigrationsSchema(res, migrations);

	return res;
};

/**
 * Normalizes DSQL access method names to standard PostgreSQL names.
 * DSQL uses different names (e.g., 'btree_index' instead of 'btree').
 */
function normalizeAccessMethod(method: string): string {
	const methodMap: Record<string, string> = {
		btree_index: 'btree',
		hash_index: 'hash',
		gist_index: 'gist',
		gin_index: 'gin',
		brin_index: 'brin',
	};
	return methodMap[method] ?? method;
}
