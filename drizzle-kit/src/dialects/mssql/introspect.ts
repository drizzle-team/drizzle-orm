import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import type { DB } from '../../utils';
import type { EntityFilter } from '../pull-utils';
import { filterMigrationsSchema } from '../utils';
import type {
	CheckConstraint,
	DefaultConstraint,
	ForeignKey,
	Index,
	InterimColumn,
	InterimSchema,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
	ViewColumn,
} from './ddl';
import { parseDefault, parseFkAction, parseViewMetadataFlag, parseViewSQL } from './grammar';

export const fromDatabase = async (
	db: DB,
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
	const tables: MssqlEntities['tables'][] = [];
	const columns: InterimColumn[] = [];
	const indexes: Index[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const defaults: DefaultConstraint[] = [];
	const views: View[] = [];
	const viewColumns: ViewColumn[] = [];

	// schema_id is needed for not joining tables by schema name but just to pass where schema_id = id
	const introspectedSchemas = await db.query<{ schema_name: string; schema_id: number }>(`
	SELECT s.name as schema_name, s.schema_id as schema_id
	FROM sys.schemas s
	JOIN sys.database_principals p ON s.principal_id = p.principal_id
	WHERE p.type IN ('S', 'U')  -- Only SQL users and Windows users
	  AND s.name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys')
	ORDER BY lower(s.name);
	`).then((rows) => {
		queryCallback('schemas', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('schemas', [], error);
		throw error;
	});

	const filteredSchemas = introspectedSchemas.filter((it) => filter({ type: 'schema', name: it.schema_name }));

	schemas.push(
		...filteredSchemas.filter((it) => it.schema_name !== 'dbo').map<Schema>((it) => ({
			entityType: 'schemas',
			name: it.schema_name,
		})),
	);

	const filteredSchemaIds = filteredSchemas.map((it) => it.schema_id);

	const tablesList = await db
		.query<{
			object_id: number;
			schema_id: number;
			name: string;
		}>(`
			SELECT 
	object_id as object_id,
	schema_id AS schema_id,
    name AS name
FROM 
    sys.tables
WHERE 
	schema_id IN (${filteredSchemaIds.join(', ')})
	AND sys.tables.is_ms_shipped = 0
ORDER BY lower(name);
`).then((rows) => {
			queryCallback('tables', rows, null);
			return rows;
		}).catch((error) => {
			queryCallback('tables', [], error);
			throw error;
		});

	const viewsList = await db.query<{
		name: string;
		object_id: number;
		schema_id: number;
		with_check_option: boolean;
		definition: string;
		schema_binding: boolean;
	}>(`
SELECT 
views.name as name,
views.object_id as object_id,
views.schema_id as schema_id,
views.with_check_option as with_check_option,
modules.definition as definition,
modules.is_schema_bound as schema_binding
FROM 
sys.views views
LEFT JOIN sys.sql_modules modules on modules.object_id = views.object_id
WHERE views.schema_id IN (${filteredSchemaIds.join(', ')})
	  AND views.is_ms_shipped = 0
ORDER BY lower(views.name);
`).then((rows) => {
			queryCallback('views', rows, null);
			return rows;
		}).catch((error) => {
			queryCallback('views', [], error);
			throw error;
		});

	const filteredTables = tablesList.filter((it) => {
		const schema = filteredSchemas.find((schema) => schema.schema_id === it.schema_id)!;

		if (!filter({ type: 'table', schema: schema.schema_name, name: it.name })) return false;
		return true;
	})
		.map((it) => {
			const schema = filteredSchemas.find((schema) => schema.schema_id === it.schema_id)!;

			return {
				...it,
				schema: schema.schema_name,
			};
		});

	const filteredTableIds = filteredTables.map((it) => it.object_id);
	const filteredViewIds = viewsList.map((it) => it.object_id);
	const filteredViewsAndTableIds = [...filteredTableIds, ...filteredViewIds];

	if (filteredViewIds.length === 0 && filteredTableIds.length === 0) {
		return {
			schemas,
			tables: [],
			columns: [],
			pks: [],
			fks: [],
			indexes: [],
			uniques: [],
			defaults: [],
			checks: [],
			views: [],
			viewColumns: [],
		};
	}

	const filterByTableIds = filteredTableIds.length > 0 ? `(${filteredTableIds.join(',')})` : '';
	const filterByTableAndViewIds = filteredViewsAndTableIds.length > 0 ? `(${filteredViewsAndTableIds.join(',')})` : '';

	for (const table of filteredTables) {
		tables.push({
			entityType: 'tables',
			schema: table.schema,
			name: table.name,
		});
	}

	const checkConstraintQuery = await db.query<{
		name: string;
		schema_id: number;
		parent_table_id: number;
		definition: string;
		is_system_named: boolean;
	}>(`
SELECT 
	name as name, 
	schema_id as schema_id, 
	parent_object_id as parent_table_id, 
	definition as definition, 
	is_system_named as is_system_named 
FROM sys.check_constraints
${filterByTableIds ? 'WHERE parent_object_id in ' + filterByTableIds : ''}
ORDER BY lower(name)
;`).then((rows) => {
		queryCallback('checks', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('checks', [], error);
		throw error;
	});

	const defaultsConstraintQuery = await db.query<{
		name: string;
		schema_id: number;
		parent_table_id: number;
		parent_column_id: number;
		definition: string;
		is_system_named: boolean;
	}>(`
SELECT 
	name as name, 
	schema_id as schema_id, 
	parent_object_id as parent_table_id, 
	parent_column_id as parent_column_id, 
	definition as definition, 
	is_system_named as is_system_named 
FROM sys.default_constraints
${filterByTableIds ? 'WHERE parent_object_id in ' + filterByTableIds : ''}
ORDER BY lower(name)
;`).then((rows) => {
		queryCallback('defaults', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('defaults', [], error);
		throw error;
	});

	type ForeignKeyRow = {
		name: string;
		schema_id: number;
		parent_table_id: number;
		parent_column_id: number;
		on_delete: string;
		on_update: string;
		is_system_named: boolean;
		reference_table_id: number;
		reference_column_id: number;
	};

	const fkCostraintQuery = await db.query<ForeignKeyRow>(`
SELECT 
	fk.name as name,
	fk.schema_id as schema_id, 
	fkc.parent_object_id as parent_table_id, 
	fkc.parent_column_id as parent_column_id, 
	fk.delete_referential_action_desc as on_delete,
	fk.update_referential_action_desc as on_update,
	fk.is_system_named as is_system_named,
	fkc.referenced_object_id as reference_table_id,
	fkc.referenced_column_id as reference_column_id
 FROM 
sys.foreign_keys fk
LEFT JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
WHERE fk.schema_id IN (${filteredSchemaIds.join(', ')})
ORDER BY lower(fk.name);
 	`).then((rows) => {
		queryCallback('fks', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('fks', [], error);
		throw error;
	});

	type RawIdxsAndConstraints = {
		table_id: number;
		index_id: number;
		name: string;
		is_unique: boolean;
		is_primary_key: boolean;
		is_unique_constraint: boolean;
		has_filter: boolean;
		filter_definition: string;
		column_id: number;
	};

	const pksUniquesAndIdxsQuery = await db.query<RawIdxsAndConstraints>(`
		SELECT 
			i.object_id as table_id,
			i.index_id as index_id,
			i.name AS name,
			i.is_unique as is_unique,
			i.is_primary_key as is_primary_key,
			i.is_unique_constraint as is_unique_constraint,
			i.has_filter as has_filter,
			i.filter_definition as filter_definition,
			ic.column_id as column_id
		FROM sys.indexes i
		INNER JOIN sys.index_columns ic 
			ON i.object_id = ic.object_id
			AND i.index_id = ic.index_id
		${filterByTableIds ? 'WHERE i.object_id in ' + filterByTableIds : ''}
		ORDER BY lower(i.name);`)
		.then((rows) => {
			queryCallback('indexes', rows, null);
			return rows;
		}).catch((error) => {
			queryCallback('indexes', [], error);
			throw error;
		});

	const columnsQuery = await db.query<{
		column_id: number;
		table_object_id: number;
		name: string;
		system_type_id: number;
		max_length_bytes: number;
		precision: number;
		scale: number;
		is_nullable: boolean;
		is_identity: boolean;
		is_computed: boolean;
		default_object_id: number;
		seed_value: number;
		increment_value: number;
		type: string;
		generated_always_definition: string | null;
		generated_is_persisted: boolean;
		rel_kind: 'U' | 'V';
	}>(`
SELECT 
  col.column_id as column_id,
  col.object_id as table_object_id,
  col.name as name,
  col.system_type_id as system_type_id,
  col.max_length as max_length_bytes,
  col.precision as precision,
  col.scale as scale,
  col.is_nullable as is_nullable,
  col.is_identity as is_identity,
  col.is_computed as is_computed,
  col.default_object_id as default_object_id,
  col.generated_always_type as generated_always_type,
  CAST(idc.seed_value AS INT) AS seed_value,
  CAST(idc.increment_value AS INT) AS increment_value,
  types.name as type,
  computed.definition as generated_always_definition,
  computed.is_persisted as generated_is_persisted,
  obj.type as rel_kind
FROM sys.columns col
LEFT JOIN sys.types types 
  ON types.system_type_id = col.system_type_id AND types.user_type_id = col.user_type_id
LEFT JOIN sys.identity_columns idc 
  ON idc.object_id = col.object_id AND idc.column_id = col.column_id
LEFT JOIN sys.computed_columns computed 
  ON computed.object_id = col.object_id AND computed.column_id = col.column_id
LEFT JOIN sys.objects obj 
  ON obj.object_id = col.object_id
WHERE obj.type in ('U', 'V')
	AND col.object_id IN ${filterByTableAndViewIds};
`).then((rows) => {
			queryCallback('columns', rows, null);
			return rows;
		}).catch((error) => {
			queryCallback('columns', [], error);
			throw error;
		});

	// TODO add counting
	let columnsCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let tableCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	const [
		checkConstraintList,
		defaultsConstraintList,
		fkCostraintList,
		pksUniquesAndIdxsList,
		columnsList,
	] = await Promise
		.all([
			checkConstraintQuery,
			defaultsConstraintQuery,
			fkCostraintQuery,
			pksUniquesAndIdxsQuery,
			columnsQuery,
		]);

	columnsCount = columnsList.length;
	tableCount = filteredTables.length;

	for (const column of columnsList.filter((it) => it.rel_kind.trim() === 'U')) {
		const table = filteredTables.find((it) => it.object_id === column.table_object_id);
		if (!table) continue; // skip if no table found

		const schema = filteredSchemas.find((it) => it.schema_id === table.schema_id)!;
		const precision = column.precision;
		const scale = column.scale;
		const bytesLength = column.max_length_bytes;

		const formatLength = (length: number | null, divisor: number = 1) => {
			if (length === null) return '';
			if (length === -1) return 'max';
			return `${length / divisor}`;
		};

		const parseOptions = (type: string) => {
			if (type === 'nchar' || type === 'nvarchar') {
				return formatLength(bytesLength, 2);
			}

			if (type === 'char' || type === 'varchar' || type === 'binary' || type === 'varbinary') {
				return formatLength(bytesLength);
			}

			if (type === 'float') {
				return String(precision);
			}

			if (type === 'datetimeoffset' || type === 'datetime2' || type === 'time') {
				return String(scale);
			}

			if (type === 'decimal' || type === 'numeric') {
				return `${precision},${scale}`;
			}

			return null;
		};
		const options = parseOptions(column.type);

		const columnType = column.type + (options ? `(${options})` : '');

		const unique = pksUniquesAndIdxsList.filter((it) => it.is_unique_constraint).find((it) => {
			return it.table_id === table.object_id && it.column_id === column.column_id;
		}) ?? null;

		const pk = pksUniquesAndIdxsList.filter((it) => it.is_primary_key).find((it) => {
			return it.table_id === table.object_id && it.column_id === column.column_id;
		}) ?? null;

		columns.push({
			entityType: 'columns',
			schema: schema.schema_name,
			table: table.name,
			name: column.name,
			type: columnType,
			isUnique: unique ? true : false,
			uniqueName: unique ? unique.name : null,
			pkName: pk ? pk.name : null,
			notNull: !column.is_nullable && !column.is_identity,
			isPK: pk ? true : false,
			generated: column.is_computed
				? {
					as: column.generated_always_definition!,
					type: column.generated_is_persisted ? 'persisted' : 'virtual',
				}
				: null,
			identity: column.is_identity
				? {
					increment: column.increment_value,
					seed: column.seed_value,
				}
				: null,
		});
	}

	type GroupedIdxsAndContraints = Omit<RawIdxsAndConstraints, 'column_id'> & {
		column_ids: number[];
	};
	const groupedIdxsAndContraints: GroupedIdxsAndContraints[] = Object.values(
		pksUniquesAndIdxsList.reduce((acc: Record<string, GroupedIdxsAndContraints>, row: RawIdxsAndConstraints) => {
			const table = filteredTables.find((it) => it.object_id === row.table_id);
			if (!table) return acc;

			const key = `${row.table_id}_${row.index_id}`;
			if (!acc[key]) {
				const { column_id: _, ...rest } = row;
				acc[key] = { ...rest, column_ids: [] };
			}
			acc[key].column_ids.push(row.column_id);
			return acc;
		}, {}),
	);

	const groupedPrimaryKeys: GroupedIdxsAndContraints[] = [];
	const groupedUniqueConstraints: GroupedIdxsAndContraints[] = [];
	const groupedIndexes: GroupedIdxsAndContraints[] = [];

	indexesCount = groupedIndexes.length;

	groupedIdxsAndContraints.forEach((it) => {
		if (it.is_primary_key) groupedPrimaryKeys.push(it);
		else if (it.is_unique_constraint) groupedUniqueConstraints.push(it);
		else groupedIndexes.push(it);
	});

	for (const unique of groupedUniqueConstraints) {
		const table = filteredTables.find((it) => it.object_id === unique.table_id);
		if (!table) continue;

		const schema = filteredSchemas.find((it) => it.schema_id === table.schema_id)!;

		const columns = unique.column_ids.map((it) => {
			const column = columnsList.find((column) =>
				column.table_object_id === unique.table_id && column.column_id === it
			)!;
			return column.name;
		});

		uniques.push({
			entityType: 'uniques',
			schema: schema.schema_name,
			table: table.name,
			name: unique.name,
			nameExplicit: true,
			columns,
		});
	}

	for (const pk of groupedPrimaryKeys) {
		const table = filteredTables.find((it) => it.object_id === pk.table_id);
		if (!table) continue;

		const schema = filteredSchemas.find((it) => it.schema_id === table.schema_id)!;

		const columns = pk.column_ids.map((it) => {
			const column = columnsList.find((column) => column.table_object_id === pk.table_id && column.column_id === it)!;
			return column.name;
		});

		pks.push({
			entityType: 'pks',
			schema: schema.schema_name,
			table: table.name,
			name: pk.name,
			nameExplicit: true,
			columns,
		});
	}

	for (const index of groupedIndexes) {
		const table = filteredTables.find((it) => it.object_id === index.table_id);
		if (!table) continue;

		const schema = filteredSchemas.find((it) => it.schema_id === table.schema_id)!;

		const columns = index.column_ids.map((it) => {
			const column = columnsList.find((column) =>
				column.table_object_id === index.table_id && column.column_id === it
			)!;
			return { value: column.name, isExpression: false };
		});

		indexes.push({
			entityType: 'indexes',
			schema: schema.schema_name,
			table: table.name,
			name: index.name,
			columns,
			where: index.has_filter ? index.filter_definition : null,
			isUnique: index.is_unique,
		});
	}

	type GroupedForeignKey = {
		name: string;
		schema_id: number;
		parent_table_id: number;
		on_delete: string;
		on_update: string;
		is_system_named: boolean;
		reference_table_id: number;
		columns: { parent_column_ids: number[]; reference_column_ids: number[] };
	};
	const groupedFkCostraints = Object.values(
		fkCostraintList.reduce((acc: Record<string, GroupedForeignKey>, row: ForeignKeyRow) => {
			const key = `${row.name}_${row.schema_id}`;

			if (acc[key]) {
				acc[key].columns.parent_column_ids.push(row.parent_column_id);
				acc[key].columns.reference_column_ids.push(row.reference_column_id);
			} else {
				acc[key] = {
					...row,
					columns: { parent_column_ids: [row.parent_column_id], reference_column_ids: [row.reference_column_id] },
				};
			}

			return acc;
		}, {}),
	);

	foreignKeysCount = groupedFkCostraints.length;
	for (const fk of groupedFkCostraints) {
		const tableFrom = filteredTables.find((it) => it.object_id === fk.parent_table_id);
		if (!tableFrom) continue;
		const schemaFrom = filteredSchemas.find((it) => it.schema_id === fk.schema_id)!;

		const tableTo = filteredTables.find((it) => it.object_id === fk.reference_table_id)!;
		const schemaTo = filteredSchemas.find((it) => it.schema_id === tableTo.schema_id)!;

		const columns = fk.columns.parent_column_ids.map((it) => {
			const column = columnsList.find((column) =>
				column.table_object_id === fk.parent_table_id && column.column_id === it
			)!;
			return column.name;
		});

		const columnsTo = fk.columns.reference_column_ids.map((it) => {
			const column = columnsList.find((column) =>
				column.table_object_id === fk.reference_table_id && column.column_id === it
			)!;
			return column.name;
		});

		fks.push({
			entityType: 'fks',
			schema: schemaFrom.schema_name,
			table: tableFrom.name,
			name: fk.name,
			nameExplicit: true,
			columns,
			tableTo: tableTo.name,
			schemaTo: schemaTo.schema_name,
			columnsTo,
			onUpdate: parseFkAction(fk.on_update),
			onDelete: parseFkAction(fk.on_delete),
		});
	}

	checksCount = checkConstraintList.length;
	for (const check of checkConstraintList) {
		const table = filteredTables.find((it) => it.object_id === check.parent_table_id);
		if (!table) continue;

		const schema = filteredSchemas.find((it) => it.schema_id === check.schema_id)!;

		checks.push({
			entityType: 'checks',
			schema: schema.schema_name,
			table: table.name,
			name: check.name,
			value: check.definition,
		});
	}

	for (const defaultConstraint of defaultsConstraintList) {
		const table = filteredTables.find((it) => it.object_id === defaultConstraint.parent_table_id);
		if (!table) continue;

		const schema = filteredSchemas.find((it) => it.schema_id === defaultConstraint.schema_id)!;
		const column = columnsList.find((it) =>
			it.column_id === defaultConstraint.parent_column_id && it.table_object_id === defaultConstraint.parent_table_id
		)!;

		defaults.push({
			entityType: 'defaults',
			schema: schema.schema_name,
			table: table.name,
			default: parseDefault(column.type, defaultConstraint.definition),
			nameExplicit: true,
			column: column.name,
			name: defaultConstraint.name,
		});
	}

	progressCallback('columns', columnsCount, 'fetching');
	progressCallback('checks', checksCount, 'fetching');
	progressCallback('indexes', indexesCount, 'fetching');
	progressCallback('tables', tableCount, 'done');

	viewsCount = viewsList.length;
	for (const view of viewsList) {
		const viewName = view.name;
		const viewSchema = filteredSchemas.find((it) => it.schema_id === view.schema_id);
		if (!viewSchema) continue;

		if (!filter({ type: 'table', schema: viewSchema.schema_name, name: viewName })) continue;
		tableCount += 1;

		const encryption = view.definition === null;
		const definition = parseViewSQL(view.definition);
		if (definition === null) {
			throw new Error(`Could not process view ${view.name}:\n${view.definition}`);
		}
		const withMetadata = parseViewMetadataFlag(view.definition);
		const checkOption = view.with_check_option;
		const schemaBinding = view.schema_binding;

		views.push({
			entityType: 'views',
			schema: viewSchema.schema_name,
			name: view.name,
			definition,
			checkOption,
			encryption,
			schemaBinding,
			viewMetadata: withMetadata,
		});

		const columns = columnsList.filter((it) => it.table_object_id === view.object_id && it.rel_kind.trim() === 'V');

		for (const viewColumn of columns) {
			viewColumns.push({
				notNull: !viewColumn.is_nullable,
				name: viewColumn.name,
				type: viewColumn.type,
				schema: viewSchema.schema_name,
				view: view.name,
			});
		}
	}

	progressCallback('columns', columnsCount, 'done');
	progressCallback('indexes', indexesCount, 'done');
	progressCallback('fks', foreignKeysCount, 'done');
	progressCallback('checks', checksCount, 'done');
	progressCallback('views', viewsCount, 'done');

	return {
		schemas,
		tables,
		columns,
		defaults,
		indexes,
		pks,
		fks,
		uniques,
		checks,
		views,
		viewColumns,
	} satisfies InterimSchema;
};

export const fromDatabaseForDrizzle = async (
	db: DB,
	filter: EntityFilter,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
	migrations: {
		table: string;
		schema: string;
	},
) => {
	const res = await fromDatabase(db, filter, progressCallback, () => {});

	filterMigrationsSchema(res, migrations);

	return res;
};
