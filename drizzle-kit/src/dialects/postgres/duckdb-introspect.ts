import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import { type DB, trimChar } from '../../utils';
import type { EntityFilter } from '../pull-utils';
import type {
	CheckConstraint,
	Enum,
	ForeignKey,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
	ViewColumn,
} from './ddl';
import { defaultForColumn, isSystemNamespace, parseViewDefinition } from './grammar';

// TODO: tables/schema/entities -> filter: (entity: {type: ... , metadata: ... }) => boolean;
// TODO: since we by default only introspect public
export const fromDatabase = async (
	db: DB,
	database: string,
	filter: EntityFilter,
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
	const enums: Enum[] = [];
	const tables: PostgresEntities['tables'][] = [];
	const columns: InterimColumn[] = [];
	const indexes: InterimIndex[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const sequences: Sequence[] = [];
	const roles: Role[] = [];
	const privileges: Privilege[] = [];
	const policies: Policy[] = [];
	const views: View[] = [];
	const viewColumns: ViewColumn[] = [];

	// type OP = {
	// 	oid: number;
	// 	name: string;
	// 	default: boolean;
	// };

	type Namespace = {
		oid: number;
		name: string;
	};

	// TODO: potential improvements
	// --- default access method
	// SHOW default_table_access_method;
	// SELECT current_setting('default_table_access_method') AS default_am;

	const namespacesQuery = db.query<Namespace>(
		`SELECT oid, schema_name as name FROM duckdb_schemas() WHERE database_name = ${database} ORDER BY lower(schema_name)`,
	)
		.then((rows) => {
			queryCallback('namespaces', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('namespaces', [], err);
			throw err;
		});

	const namespaces = await namespacesQuery;

	const { other } = namespaces.reduce<{ system: Namespace[]; other: Namespace[] }>(
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

	const filteredNamespaces = other.filter((it) => filter({ type: 'schema', name: it.name }));

	if (filteredNamespaces.length === 0) {
		return {
			schemas,
			tables,
			enums,
			columns,
			indexes,
			pks,
			fks,
			uniques,
			checks,
			sequences,
			roles,
			privileges,
			policies,
			views,
			viewColumns,
		} satisfies InterimSchema;
	}

	const filteredNamespacesIds = filteredNamespaces.map((it) => it.oid);

	schemas.push(...filteredNamespaces.map<Schema>((it) => ({ entityType: 'schemas', name: it.name })));

	const tablesList = await db
		.query<{
			oid: number;
			schema: string;
			name: string;
			definition: string | null;
			type: 'table' | 'view';
		}>(`
            SELECT
                table_oid AS "oid",
                schema_name AS "schema",
                table_name AS "name",
                NULL AS "definition",
                'table' AS "type"
            FROM
                duckdb_tables()
            WHERE database_name = ${database}
                AND schema_oid IN (${filteredNamespacesIds.join(', ')})

            UNION ALL

            SELECT
                view_oid AS "oid",
                schema_name AS "schema",
                view_name AS "name",
                sql AS "definition",
                'view' AS "type"
            FROM
                duckdb_views()
            WHERE database_name = ${database}
                AND schema_oid IN (${filteredNamespacesIds.join(', ')})
            ORDER BY lower(schema_name), lower(name)
        `).then((rows) => {
			queryCallback('tables', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('tables', [], err);
			throw err;
		});

	const viewsList = tablesList.filter((it) => it.type === 'view');

	const filteredTables = tablesList.filter((it) => {
		if (!(it.type === 'table' && filter({ type: 'table', schema: it.schema, name: it.name }))) return false;
		it.schema = trimChar(it.schema, '"'); // when camel case name e.x. mySchema -> it gets wrapped to "mySchema"
		return true;
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
			isRlsEnabled: false,
		});
	}

	// const dependQuery = db.query<{
	// 	oid: number;
	// 	tableId: number;
	// 	ordinality: number;

	// 	/*
	//         a - An “auto” dependency means the dependent object can be dropped separately,
	//                 and will be automatically removed if the referenced object is dropped—regardless of CASCADE or RESTRICT.
	//                 Example: A named constraint on a table is auto-dependent on the table, so it vanishes when the table is dropped

	//                 i - An “internal” dependency marks objects that were created as part of building another object.
	//                 Directly dropping the dependent is disallowed—you must drop the referenced object instead.
	//                 Dropping the referenced object always cascades to the dependent
	//                 Example: A trigger enforcing a foreign-key constraint is internally dependent on its pg_constraint entry
	//      */
	// 	deptype: 'a' | 'i';
	// }>(
	// 	`SELECT
	//         -- sequence id
	//         objid as oid,
	//         refobjid as "tableId",
	//         refobjsubid as "ordinality",

	//         -- a = auto
	//         deptype
	//     FROM
	//         duckdb_dependencies()
	//     where ${filterByTableIds ? ` refobjid in ${filterByTableIds}` : 'false'}`,
	// ).then((rows) => {
	// 	queryCallback('depend', rows, null);
	// 	return rows;
	// }).catch((err) => {
	// 	queryCallback('depend', [], err);
	// 	throw err;
	// });

	// const enumsQuery = db
	// 	.query<{
	// 		oid: number;
	// 		name: string;
	// 		schemaId: number;
	// 		arrayTypeId: number;
	// 		ordinality: number;
	// 		value: string;
	// 	}>(`SELECT
	//             pg_type.oid as "oid",
	//             typname as "name",
	//             typnamespace as "schemaId",
	//             pg_type.typarray as "arrayTypeId",
	//             pg_enum.enumsortorder AS "ordinality",
	//             pg_enum.enumlabel AS "value"
	//         FROM
	//             pg_type
	//         JOIN pg_enum on pg_enum.enumtypid=pg_type.oid
	//         WHERE
	//             pg_type.typtype = 'e'
	//             AND typnamespace IN (${filteredNamespacesIds.join(',')})
	//         ORDER BY pg_type.oid, pg_enum.enumsortorder
	//     `).then((rows) => {
	// 		queryCallback('enums', rows, null);
	// 		return rows;
	// 	}).catch((err) => {
	// 		queryCallback('enums', [], err);
	// 		throw err;
	// 	});

	// fetch for serials, adrelid = tableid
	// const serialsQuery = db
	// 	.query<{
	// 		oid: number;
	// 		tableId: number;
	// 		ordinality: number;
	// 		expression: string;
	// 	}>(`SELECT
	//             oid,
	//             adrelid as "tableId",
	//             adnum as "ordinality",
	//             pg_get_expr(adbin, adrelid) as "expression"
	//         FROM
	//             pg_attrdef
	//         WHERE ${filterByTableIds ? ` adrelid in ${filterByTableIds}` : 'false'}
	//     `).then((rows) => {
	// 		queryCallback('serials', rows, null);
	// 		return rows;
	// 	}).catch((err) => {
	// 		queryCallback('serials', [], err);
	// 		throw err;
	// 	});

	// const sequencesQuery = db.query<{
	// 	schema: string;
	// 	oid: number;
	// 	name: string;
	// 	startWith: string;
	// 	minValue: string;
	// 	maxValue: string;
	// 	incrementBy: string;
	// 	cycle: boolean;
	// 	cacheSize: number;
	// }>(`SELECT
	//         n.nspname as "schema",
	//         c.relname as "name",
	//         seqrelid as "oid",
	//         seqstart as "startWith",
	//         seqmin as "minValue",
	//         seqmax as "maxValue",
	//         seqincrement as "incrementBy",
	//         seqcycle as "cycle",
	//         seqcache as "cacheSize"
	//     FROM pg_sequence
	//     LEFT JOIN pg_class c ON pg_sequence.seqrelid=c.oid
	//     LEFT JOIN pg_namespace n ON c.relnamespace=n.oid
	//     WHERE relnamespace IN (${filteredNamespacesIds.join(',')})
	//     ORDER BY relnamespace, lower(relname);
	// `).then((rows) => {
	// 	queryCallback('sequences', rows, null);
	// 	return rows;
	// }).catch((err) => {
	// 	queryCallback('sequences', [], err);
	// 	throw err;
	// });

	const constraintsQuery = db.query<{
		schemaId: number;
		tableId: number;
		name: string;
		type: 'PRIMARY KEY' | 'UNIQUE' | 'FOREIGN KEY' | 'CHECK'; // p - primary key, u - unique, f - foreign key, c - check
		definition: string;
		tableToName: string;
		columnsNames: string[];
		columnsToNames: string[];
	}>(`
        SELECT
            schema_oid AS "schemaId",
            table_oid AS "tableId",
            constraint_name AS "name",
            constraint_type AS "type",
            constraint_text AS "definition",
            referenced_table AS "tableToName",
            constraint_column_names AS "columnsNames",
            referenced_column_names AS "columnsToNames"
        FROM
            duckdb_constraints()
        WHERE database_name = ${database}
			AND ${filterByTableIds ? `table_oid in ${filterByTableIds}` : 'false'}
        ORDER BY constraint_type, lower(constraint_name);
  `).then((rows) => {
		queryCallback('constraints', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('constraints', [], err);
		throw err;
	});

	// for serials match with pg_attrdef via attrelid(tableid)+adnum(ordinal position), for enums with pg_enum above
	const columnsQuery = db.query<{
		tableId: number;
		name: string;
		ordinality: number;
		notNull: boolean;
		typeId: number;
		type: string;
		default: string | null;
	}>(`SELECT
            table_oid AS "tableId",
            column_name AS "name",
            column_index AS "ordinality",
            is_nullable = false AS "notNull",
            data_type_id AS "typeId",
            lower(data_type) AS "type",
            column_default AS "default"
        FROM
            duckdb_columns()
        WHERE
        ${filterByTableAndViewIds ? ` table_oid in ${filterByTableAndViewIds}` : 'false'}
            AND database_name = ${database}
        ORDER BY column_index;
    `).then((rows) => {
		queryCallback('columns', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('columns', [], err);
		throw err;
	});

	const [
		// dependList,
		// enumsList,
		// serialsList,
		// sequencesList,
		constraintsList,
		columnsList,
	] = await Promise
		.all([
			// dependQuery,
			// enumsQuery,
			// serialsQuery,
			// sequencesQuery,
			constraintsQuery,
			columnsQuery,
		]);

	// const groupedEnums = enumsList.reduce((acc, it) => {
	// 	if (!(it.oid in acc)) {
	// 		const schemaName = filteredNamespaces.find((sch) => sch.oid === it.schemaId)!.name;
	// 		acc[it.oid] = {
	// 			oid: it.oid,
	// 			schema: schemaName,
	// 			name: it.name,
	// 			values: [it.value],
	// 		};
	// 	} else {
	// 		acc[it.oid].values.push(it.value);
	// 	}
	// 	return acc;
	// }, {} as Record<number, { oid: number; schema: string; name: string; values: string[] }>);

	// const groupedArrEnums = enumsList.reduce((acc, it) => {
	// 	if (!(it.arrayTypeId in acc)) {
	// 		const schemaName = filteredNamespaces.find((sch) => sch.oid === it.schemaId)!.name;
	// 		acc[it.arrayTypeId] = {
	// 			oid: it.oid,
	// 			schema: schemaName,
	// 			name: it.name,
	// 			values: [it.value],
	// 		};
	// 	} else {
	// 		acc[it.arrayTypeId].values.push(it.value);
	// 	}
	// 	return acc;
	// }, {} as Record<number, { oid: number; schema: string; name: string; values: string[] }>);

	// for (const it of Object.values(groupedEnums)) {
	// 	enums.push({
	// 		entityType: 'enums',
	// 		schema: it.schema,
	// 		name: it.name,
	// 		values: it.values,
	// 	});
	// }

	let columnsCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let tableCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	// for (const seq of sequencesList) {
	// 	const depend = dependList.find((it) => it.oid === seq.oid);

	// 	if (depend && (depend.deptype === 'a' || depend.deptype === 'i')) {
	// 		// TODO: add type field to sequence in DDL
	// 		// skip fo sequences or identity columns
	// 		// console.log('skip for auto created', seq.name);
	// 		continue;
	// 	}

	// 	sequences.push({
	// 		entityType: 'sequences',
	// 		schema: seq.schema,
	// 		name: seq.name,
	// 		startWith: parseIdentityProperty(seq.startWith),
	// 		minValue: parseIdentityProperty(seq.minValue),
	// 		maxValue: parseIdentityProperty(seq.maxValue),
	// 		incrementBy: parseIdentityProperty(seq.incrementBy),
	// 		cycle: seq.cycle,
	// 		cacheSize: Number(parseIdentityProperty(seq.cacheSize) ?? 1),
	// 	});
	// }

	// progressCallback('enums', Object.keys(groupedEnums).length, 'done');

	// type DBColumn = (typeof columnsList)[number];

	const tableColumns = columnsList.filter((it) => {
		const table = tablesList.find((tbl) => tbl.oid === it.tableId);
		return !!table;
	});

	// supply serials
	for (const column of tableColumns) {
		const type = column.type;

		if (!(type === 'smallint' || type === 'bigint' || type === 'integer')) {
			continue;
		}

		// const expr = serialsList.find(
		// 	(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		// );

		// if (expr) {
		// 	const table = tablesList.find((it) => it.oid === column.tableId)!;

		// 	const isSerial = isSerialExpression(expr.expression, table.schema);
		// 	column.type = isSerial ? type === 'bigint' ? 'bigserial' : type === 'integer' ? 'serial' : 'smallserial' : type;
		// }
	}

	for (const column of tableColumns) {
		const table = tablesList.find((it) => it.oid === column.tableId)!;

		// supply enums
		// const enumType = column.typeId in groupedEnums
		// 	? groupedEnums[column.typeId]
		// 	: column.typeId in groupedArrEnums
		// 	? groupedArrEnums[column.typeId]
		// 	: null;

		// let columnTypeMapped = enumType ? enumType.name : column.type.replace('[]', '');
		let columnTypeMapped = column.type;
		let dimensions = 0;

		// check if column is array
		const arrayRegex = /\[(\d+)?\]$/;
		if (arrayRegex.test(columnTypeMapped)) {
			columnTypeMapped = columnTypeMapped.replace(arrayRegex, '');
			dimensions = 1;
		}

		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace(' with time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		columnTypeMapped = trimChar(columnTypeMapped, '"');

		const columnDefault = column.default;

		const defaultValue = defaultForColumn(
			columnTypeMapped,
			columnDefault,
			0,
			false, // TODO
		);

		const unique = constraintsList.find((it) => {
			return it.type === 'UNIQUE' && it.tableId === column.tableId && it.columnsNames.length === 1
				&& it.columnsNames.includes(column.name);
		}) ?? null;

		const pk = constraintsList.find((it) => {
			return it.type === 'PRIMARY KEY' && it.tableId === column.tableId && it.columnsNames.length === 1
				&& it.columnsNames.includes(column.name);
		}) ?? null;

		columns.push({
			entityType: 'columns',
			schema: table.schema,
			table: table.name,
			name: column.name,
			type: columnTypeMapped,
			// typeSchema: enumType ? enumType.schema ?? 'public' : null,
			typeSchema: null,
			dimensions,
			default: defaultValue,
			unique: !!unique,
			uniqueName: unique ? unique.name : null,
			uniqueNullsNotDistinct: unique?.definition.includes('NULLS NOT DISTINCT') ?? false,
			notNull: column.notNull,
			pk: pk !== null,
			pkName: pk !== null ? pk.name : null,
			generated: null,
			identity: null,
		});
	}

	for (const unique of constraintsList.filter((it) => it.type === 'UNIQUE')) {
		const table = tablesList.find((it) => it.oid === unique.tableId)!;
		const schema = namespaces.find((it) => it.oid === unique.schemaId)!;

		const columns = unique.columnsNames.map((it) => {
			const column = columnsList.find((column) => column.tableId === unique.tableId && column.name === it)!;
			return column.name;
		});

		uniques.push({
			entityType: 'uniques',
			schema: schema.name,
			table: table.name,
			name: unique.name,
			nameExplicit: true,
			columns,
			nullsNotDistinct: unique.definition.includes('NULLS NOT DISTINCT'),
		});
	}

	for (const pk of constraintsList.filter((it) => it.type === 'PRIMARY KEY')) {
		const table = tablesList.find((it) => it.oid === pk.tableId)!;
		const schema = namespaces.find((it) => it.oid === pk.schemaId)!;

		const columns = pk.columnsNames.map((it) => {
			const column = columnsList.find((column) => column.tableId === pk.tableId && column.name === it)!;
			return column.name;
		});

		pks.push({
			entityType: 'pks',
			schema: schema.name,
			table: table.name,
			name: pk.name,
			columns,
			nameExplicit: true,
		});
	}

	for (const fk of constraintsList.filter((it) => it.type === 'FOREIGN KEY')) {
		const table = tablesList.find((it) => it.oid === fk.tableId)!;
		const schema = namespaces.find((it) => it.oid === fk.schemaId)!;
		const tableTo = tablesList.find((it) => it.schema === schema.name && it.name === fk.tableToName)!;

		const columns = fk.columnsNames.map((it) => {
			const column = columnsList.find((column) => column.tableId === fk.tableId && column.name === it)!;
			return column.name;
		});

		const columnsTo = fk.columnsToNames.map((it) => {
			const column = columnsList.find((column) => column.tableId === tableTo.oid && column.name === it)!;
			return column.name;
		});

		fks.push({
			entityType: 'fks',
			schema: schema.name,
			table: table.name,
			name: fk.name,
			nameExplicit: true,
			columns,
			tableTo: tableTo.name,
			schemaTo: schema.name,
			columnsTo,
			onUpdate: 'NO ACTION',
			onDelete: 'NO ACTION',
		});
	}

	for (const check of constraintsList.filter((it) => it.type === 'CHECK')) {
		const table = tablesList.find((it) => it.oid === check.tableId)!;
		const schema = namespaces.find((it) => it.oid === check.schemaId)!;

		checks.push({
			entityType: 'checks',
			schema: schema.name,
			table: table.name,
			name: check.name,
			value: check.definition,
		});
	}

	// const idxs = await db.query<{
	// 	oid: number;
	// 	schema: string;
	// 	name: string;
	// 	accessMethod: string;
	// 	with?: string[];
	// 	metadata: {
	// 		tableId: number;
	// 		expression: string | null;
	// 		where: string;
	// 		columnOrdinals: number[];
	// 		options: number[];
	// 		isUnique: boolean;
	// 		isPrimary: boolean;
	// 	};
	// }>(`
	//   SELECT
	//     pg_class.oid,
	//     n.nspname as "schema",
	//     relname AS "name",
	//     am.amname AS "accessMethod",
	//     reloptions AS "with",
	//     row_to_json(metadata) as "metadata"
	//   FROM
	//     pg_class
	//   JOIN pg_am am ON am.oid = pg_class.relam
	//   JOIN pg_namespace n ON relnamespace = n.oid
	//   LEFT JOIN LATERAL (
	//     SELECT
	//       pg_get_expr(indexprs, indrelid) AS "expression",
	//       pg_get_expr(indpred, indrelid) AS "where",
	//       indrelid::int AS "tableId",
	//       indkey::int[] as "columnOrdinals",
	//       indoption::int[] as "options",
	//       indisunique as "isUnique",
	//       indisprimary as "isPrimary"
	//     FROM
	//       pg_index
	//     WHERE
	//       pg_index.indexrelid = pg_class.oid
	//   ) metadata ON TRUE
	//   WHERE
	//     relkind = 'i' and ${filterByTableIds ? `metadata."tableId" in ${filterByTableIds}` : 'false'}
	//   ORDER BY relnamespace, lower(relname);
	// `).then((rows) => {
	// 	queryCallback('indexes', rows, null);
	// 	return rows;
	// }).catch((err) => {
	// 	queryCallback('indexes', [], err);
	// 	throw err;
	// });

	// for (const idx of idxs) {
	// 	const { metadata } = idx;

	// 	const expr = splitExpressions(metadata.expression);

	// 	const table = tablesList.find((it) => it.oid === idx.metadata.tableId)!;

	// 	const nonColumnsCount = metadata.columnOrdinals.reduce((acc, it) => {
	// 		if (it === 0) acc += 1;
	// 		return acc;
	// 	}, 0);

	// 	if (expr.length !== nonColumnsCount) {
	// 		throw new Error(
	// 			`expression split doesn't match non-columns count: [${
	// 				metadata.columnOrdinals.join(
	// 					', ',
	// 				)
	// 			}] '${metadata.expression}':${expr.length}:${nonColumnsCount}`,
	// 		);
	// 	}

	// 	const opts = metadata.options.map((it) => {
	// 		return {
	// 			descending: (it & 1) === 1,
	// 			nullsFirst: (it & 2) === 2,
	// 		};
	// 	});

	// 	const res = [] as (
	// 		& (
	// 			| { type: 'expression'; value: string }
	// 			| { type: 'column'; value: DBColumn }
	// 		)
	// 		& { options: (typeof opts)[number] }
	// 	)[];

	// 	let k = 0;
	// 	for (let i = 0; i < metadata.columnOrdinals.length; i++) {
	// 		const ordinal = metadata.columnOrdinals[i];
	// 		if (ordinal === 0) {
	// 			res.push({
	// 				type: 'expression',
	// 				value: expr[k],
	// 				options: opts[i],
	// 			});
	// 			k += 1;
	// 		} else {
	// 			const column = columnsList.find((column) => {
	// 				return column.tableId === metadata.tableId && column.ordinality === ordinal;
	// 			});
	// 			if (!column) throw new Error(`missing column: ${metadata.tableId}:${ordinal}`);

	// 			// ! options and opclass can be undefined when index have "INCLUDE" columns (columns from "INCLUDE" don't have options and opclass)
	// 			const options = opts[i] as typeof opts[number] | undefined;
	// 			if (options) {
	// 				res.push({
	// 					type: 'column',
	// 					value: column,
	// 					options: opts[i],
	// 				});
	// 			}
	// 		}
	// 	}

	// 	const columns = res.map((it) => {
	// 		return {
	// 			asc: !it.options.descending,
	// 			nullsFirst: it.options.nullsFirst,
	// 			opclass: null,
	// 			isExpression: it.type === 'expression',
	// 			value: it.type === 'expression' ? it.value : it.value.name, // column name
	// 		} satisfies Index['columns'][number];
	// 	});

	// 	indexes.push({
	// 		entityType: 'indexes',
	// 		schema: idx.schema,
	// 		table: table.name,
	// 		name: idx.name,
	// 		nameExplicit: true,
	// 		method: idx.accessMethod,
	// 		isUnique: metadata.isUnique,
	// 		with: idx.with?.join(', ') ?? '',
	// 		where: idx.metadata.where,
	// 		columns: columns,
	// 		concurrently: false,
	// 		forUnique: false,
	// 		forPK: false,
	// 	});
	// }

	progressCallback('columns', columnsCount, 'fetching');
	progressCallback('checks', checksCount, 'fetching');
	progressCallback('indexes', indexesCount, 'fetching');
	progressCallback('tables', tableCount, 'done');

	for (
		const it of columnsList.filter((it) => {
			const view = viewsList.find((x) => x.oid === it.tableId);
			return !!view;
		})
	) {
		const view = viewsList.find((x) => x.oid === it.tableId)!;

		// const enumType = it.typeId in groupedEnums
		// 	? groupedEnums[it.typeId]
		// 	: it.typeId in groupedArrEnums
		// 	? groupedArrEnums[it.typeId]
		// 	: null;

		// let columnTypeMapped = enumType ? enumType.name : it.type.replace('[]', '');
		let columnTypeMapped = it.type.replace('[]', '');
		columnTypeMapped = trimChar(columnTypeMapped, '"');
		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		const typeDimensions = it.type.split('[]').length - 1;

		viewColumns.push({
			schema: view.schema,
			view: view.name,
			name: it.name,
			type: columnTypeMapped,
			notNull: it.notNull,
			dimensions: 0,
			// typeSchema: enumType ? enumType.schema : null,
			typeSchema: null,
			typeDimensions,
		});
	}

	for (const view of viewsList) {
		if (!filter({ type: 'table', schema: view.schema, name: view.name })) continue;
		tableCount += 1;

		const definition = parseViewDefinition(view.definition);

		views.push({
			entityType: 'views',
			schema: view.schema,
			name: view.name,
			definition,
			with: null,
			materialized: false,
			tablespace: null,
			using: null,
			withNoData: null,
		});
	}

	// TODO: update counts!
	progressCallback('columns', columnsCount, 'done');
	progressCallback('indexes', indexesCount, 'done');
	progressCallback('fks', foreignKeysCount, 'done');
	progressCallback('checks', checksCount, 'done');
	progressCallback('views', viewsCount, 'done');

	return {
		schemas,
		tables,
		enums,
		columns,
		indexes,
		pks,
		fks,
		uniques,
		checks,
		sequences,
		roles,
		privileges,
		policies,
		views,
		viewColumns,
	} satisfies InterimSchema;
};
