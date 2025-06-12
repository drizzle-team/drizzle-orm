import camelcase from 'camelcase';
import type { Entities } from '../../cli/validations/cli';
import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import type { DB } from '../../utils';
import type {
	CheckConstraint,
	CockroachEntities,
	Enum,
	ForeignKey,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	View,
	ViewColumn,
} from './ddl';
import {
	defaultForColumn,
	isSystemNamespace,
	parseOnType,
	parseViewDefinition,
	splitExpressions,
	splitSqlType,
	stringFromDatabaseIdentityProperty as parseIdentityProperty,
	trimChar,
} from './grammar';

function prepareRoles(entities?: {
	roles: boolean | {
		provider?: string | undefined;
		include?: string[] | undefined;
		exclude?: string[] | undefined;
	};
}) {
	if (!entities || !entities.roles) return { useRoles: false, include: [], exclude: [] };

	const roles = entities.roles;
	const useRoles: boolean = typeof roles === 'boolean' ? roles : false;
	const include: string[] = typeof roles === 'object' ? roles.include ?? [] : [];
	const exclude: string[] = typeof roles === 'object' ? roles.exclude ?? [] : [];
	const provider = typeof roles === 'object' ? roles.provider : undefined;

	if (provider === 'supabase') {
		exclude.push(...[
			'anon',
			'authenticator',
			'authenticated',
			'service_role',
			'supabase_auth_admin',
			'supabase_storage_admin',
			'dashboard_user',
			'supabase_admin',
		]);
	}

	if (provider === 'neon') {
		exclude.push(...['authenticated', 'anonymous']);
	}

	return { useRoles, include, exclude };
}

// TODO: tables/schema/entities -> filter: (entity: {type: ..., metadata....})=>boolean;
// TODO: since we by default only introspect public
export const fromDatabase = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	schemaFilter: (schema: string) => boolean = () => true,
	entities?: Entities,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
): Promise<InterimSchema> => {
	const schemas: Schema[] = [];
	const enums: Enum[] = [];
	const tables: CockroachEntities['tables'][] = [];
	const columns: InterimColumn[] = [];
	const indexes: InterimIndex[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const checks: CheckConstraint[] = [];
	const sequences: Sequence[] = [];
	const roles: Role[] = [];
	const policies: Policy[] = [];
	const views: View[] = [];
	const viewColumns: ViewColumn[] = [];

	type Namespace = {
		oid: number;
		name: string;
	};

	// TODO: potential improvements
	// --- default access method
	// SHOW default_table_access_method;
	// SELECT current_setting('default_table_access_method') AS default_am;

	const accessMethodsQuery = db.query<{ oid: number; name: string }>(
		`SELECT oid, amname as name FROM pg_am WHERE amtype = 't'`,
	);

	const tablespacesQuery = db.query<{
		oid: number;
		name: string;
	}>('SELECT oid, spcname as "name" FROM pg_tablespace');

	const namespacesQuery = db.query<Namespace>('select oid, nspname as name from pg_namespace');

	const defaultsQuery = await db.query<{
		tableId: number;
		ordinality: number;
		expression: string;
	}>(`
		SELECT
			adrelid AS "tableId",
			adnum AS "ordinality",
			pg_get_expr(adbin, adrelid) AS "expression"
		FROM
			pg_attrdef;
	`);

	const [ams, tablespaces, namespaces, defaultsList] = await Promise.all([
		accessMethodsQuery,
		tablespacesQuery,
		namespacesQuery,
		defaultsQuery,
	]);

	const { system, other } = namespaces.reduce<{ system: Namespace[]; other: Namespace[] }>(
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

	const filteredNamespaces = other.filter((it) => schemaFilter(it.name));
	const filteredNamespacesIds = filteredNamespaces.map((it) => it.oid);

	schemas.push(...filteredNamespaces.map<Schema>((it) => ({ entityType: 'schemas', name: it.name })));

	const tablesList = await db
		.query<{
			oid: number;
			schemaId: number;
			name: string;

			/* r - table, v - view, m - materialized view */
			kind: 'r' | 'v' | 'm';
			accessMethod: number;
			options: string[] | null;
			rlsEnabled: boolean;
			tablespaceid: number;
			definition: string | null;
		}>(`
				SELECT
					oid,
					relnamespace AS "schemaId",
					relname AS "name",
					relkind AS "kind",
					relam as "accessMethod",
					reloptions::text[] as "options",
					reltablespace as "tablespaceid",
					relrowsecurity AS "rlsEnabled",
					case 
						when relkind = 'v' or relkind = 'm'
							then pg_get_viewdef(oid, true)
						else null 
					end as "definition"
				FROM
					pg_class
				WHERE
					relkind IN ('r', 'v', 'm')
					AND relnamespace IN (${filteredNamespacesIds.join(', ')});`);

	const viewsList = tablesList.filter((it) => it.kind === 'v' || it.kind === 'm');

	const filteredTables = tablesList.filter((it) => it.kind === 'r' && tablesFilter(it.name)).map((it) => {
		const schema = filteredNamespaces.find((ns) => ns.oid === it.schemaId)!;
		return {
			...it,
			schema: trimChar(schema.name, '"'), // when camel case name e.x. mySchema -> it gets wrapped to "mySchema"
		};
	});
	const filteredTableIds = filteredTables.map((it) => it.oid);
	const viewsIds = viewsList.map((it) => it.oid);
	const filteredViewsAndTableIds = [...filteredTableIds, ...viewsIds];

	const filterByTableIds = filteredTableIds.length > 0 ? `(${filteredTableIds.join(',')})` : '';
	const filterByTableAndViewIds = filteredViewsAndTableIds.length > 0 ? `(${filteredViewsAndTableIds.join(',')})` : '';

	for (const table of filteredTables) {
		tables.push({
			entityType: 'tables',
			schema: table.schema,
			name: table.name,
			isRlsEnabled: table.rlsEnabled,
		});
	}

	const dependQuery = db.query<{
		oid: number;
		tableId: number;
		ordinality: number;

		/*
			a - An “auto” dependency means the dependent object can be dropped separately,
					and will be automatically removed if the referenced object is dropped—regardless of CASCADE or RESTRICT.
					Example: A named constraint on a table is auto-dependent on the table, so it vanishes when the table is dropped

					i - An “internal” dependency marks objects that were created as part of building another object.
					Directly dropping the dependent is disallowed—you must drop the referenced object instead.
					Dropping the referenced object always cascades to the dependent
					Example: A trigger enforcing a foreign-key constraint is internally dependent on its pg_constraint entry
		 */
		deptype: 'a' | 'i';
	}>(
		`SELECT
			-- sequence id
			objid as oid,
			refobjid as "tableId",
			refobjsubid as "ordinality",
			
			-- a = auto
			deptype
		FROM
			pg_depend
		where ${filterByTableIds ? ` refobjid in ${filterByTableIds}` : 'false'};`,
	);

	const enumsQuery = db
		.query<{
			oid: number;
			name: string;
			schemaId: number;
			arrayTypeId: number;
			ordinality: number;
			value: string;
		}>(`SELECT
					pg_type.oid as "oid",
					typname as "name",
					typnamespace as "schemaId",
					pg_type.typarray as "arrayTypeId",
					pg_enum.enumsortorder AS "ordinality",
					pg_enum.enumlabel AS "value"
				FROM
					pg_type
				JOIN pg_enum on pg_enum.enumtypid=pg_type.oid
				WHERE
					pg_type.typtype = 'e'
					AND typnamespace IN (${filteredNamespacesIds.join(',')})
				ORDER BY pg_type.oid, pg_enum.enumsortorder`);

	const sequencesQuery = db.query<{
		schemaId: number;
		oid: number;
		name: string;
		startWith: string;
		minValue: string;
		maxValue: string;
		incrementBy: string;
		cycle: boolean;
		cacheSize: string;
	}>(`SELECT 
    pg_class.relnamespace as "schemaId",
    pg_class.relname as "name",
    pg_sequence.seqrelid as "oid",
    pg_sequence.seqstart as "startWith", 
    pg_sequence.seqmin as "minValue", 
    pg_sequence.seqmax as "maxValue", 
    pg_sequence.seqincrement as "incrementBy", 
    pg_sequence.seqcycle as "cycle", 
    COALESCE(pgs.cache_size, pg_sequence.seqcache) as "cacheSize"
FROM pg_sequence
LEFT JOIN pg_class ON pg_sequence.seqrelid = pg_class.oid
LEFT JOIN pg_sequences pgs ON (
    pgs.sequencename = pg_class.relname 
    AND pgs.schemaname = pg_class.relnamespace::regnamespace::text
)
WHERE relnamespace IN (${filteredNamespacesIds.join(',')});`);

	// I'm not yet aware of how we handle policies down the pipeline for push,
	// and since postgres does not have any default policies, we can safely fetch all of them for now
	// and filter them out in runtime, simplifying filterings
	const policiesQuery = db.query<
		{
			schema: string;
			table: string;
			name: string;
			as: Policy['as'];
			to: string | string[]; // TODO: | string[] ??
			for: Policy['for'];
			using: string | undefined | null;
			withCheck: string | undefined | null;
		}
	>(`SELECT 
			schemaname as "schema", 
			tablename as "table", 
			policyname as "name", 
			UPPER(permissive) as "as", 
			roles as "to", 
			cmd as "for", 
			qual as "using", 
			with_check as "withCheck" 
		FROM pg_policies;`);

	const rolesQuery = await db.query<
		{ rolname: string; rolinherit: boolean; rolcreatedb: boolean; rolcreaterole: boolean }
	>(
		`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
	);

	const constraintsQuery = db.query<{
		oid: number;
		schemaId: number;
		tableId: number;
		name: string;
		type: 'p' | 'u' | 'f' | 'c'; // p - primary key, u - unique, f - foreign key, c - check
		definition: string;
		indexId: number;
		columnsOrdinals: number[];
		tableToId: number;
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
      pg_get_constraintdef(oid) AS "definition",
      conindid AS "indexId",
      conkey AS "columnsOrdinals",
      confrelid AS "tableToId",
      confkey AS "columnsToOrdinals",
      confupdtype AS "onUpdate",
      confdeltype AS "onDelete"
    FROM
      pg_constraint
    WHERE ${filterByTableIds ? ` conrelid in ${filterByTableIds}` : 'false'}
  `);

	// for serials match with pg_attrdef via attrelid(tableid)+adnum(ordinal position), for enums with pg_enum above
	const columnsQuery = db.query<{
		tableId: number;
		kind: 'r' | 'v' | 'm';
		name: string;
		ordinality: number;
		notNull: boolean;
		type: string;
		typeId: number;
		/* s - stored */
		generatedType: 's' | '';
		/*
		'a' for GENERATED ALWAYS
		'd' for GENERATED BY DEFAULT
		*/
		identityType: 'a' | 'd' | '';
		metadata: {
			seqId: string | null;
			generation: string | null;
			start: string | null;
			increment: string | null;
			max: string | null;
			min: string | null;
			cycle: string;
			generated: 'ALWAYS' | 'BY DEFAULT';
			expression: string | null;
		} | null;
		isHidden: boolean;
		dimensions: '0' | '1';
	}>(`SELECT
				attrelid AS "tableId",
				relkind AS "kind",
				attname AS "name",
				attnum AS "ordinality",
				attnotnull AS "notNull",
				atttypid as "typeId",
				attgenerated as "generatedType", 
				attidentity as "identityType",
				format_type(atttypid, atttypmod) as "type",
				CASE
    			    WHEN typ.typcategory = 'A' THEN 1
    			    ELSE 0
    			END AS "dimensions",
				CASE
					WHEN attidentity in ('a', 'd') or attgenerated = 's' THEN (
						SELECT
							row_to_json(c.*)
						FROM
							(
								SELECT
									pg_get_serial_sequence("table_schema" || '.' || "table_name", "attname")::regclass::oid as "seqId",
									"identity_generation" AS generation,
									"identity_start" AS "start",
									"identity_increment" AS "increment",
									"identity_maximum" AS "max",
									"identity_minimum" AS "min",
									"identity_cycle" AS "cycle",
									"generation_expression" AS "expression"
								FROM
									information_schema.columns c
								WHERE
									c.column_name = attname
									-- relnamespace is schemaId, regnamescape::text converts to schemaname
									AND c.table_schema = cls.relnamespace::regnamespace::text
									-- attrelid is tableId, regclass::text converts to table name
									AND c.table_name = attrelid::regclass::text
							) c
						)
					ELSE NULL
				END AS "metadata",
				tc.hidden AS "isHidden"
			FROM
				pg_attribute attr
				LEFT JOIN pg_class cls ON cls.oid = attr.attrelid
				LEFT JOIN crdb_internal.table_columns tc ON tc.descriptor_id = attrelid AND tc.column_id = attnum
				LEFT JOIN pg_type typ ON typ.oid = attr.atttypid
			WHERE
			${filterByTableAndViewIds ? ` attrelid in ${filterByTableAndViewIds}` : 'false'}
				AND attnum > 0
				AND attisdropped = FALSE;`);

	const extraColumnDataTypesQuery = db.query<{
		table_schema: string;
		table_name: string;
		column_name: string;
		data_type: string;
	}>(`SELECT 
			table_schema as table_schema, 
			table_name as table_name, 
			column_name as column_name, 
			lower(crdb_sql_type) as data_type  
		FROM information_schema.columns 
		WHERE  ${tablesList.length ? `table_name in (${tablesList.map((it) => `'${it.name}'`).join(', ')})` : 'false'}`);

	const [
		dependList,
		enumsList,
		sequencesList,
		policiesList,
		rolesList,
		constraintsList,
		columnsList,
		extraColumnDataTypesList,
	] = await Promise
		.all([
			dependQuery,
			enumsQuery,
			sequencesQuery,
			policiesQuery,
			rolesQuery,
			constraintsQuery,
			columnsQuery,
			extraColumnDataTypesQuery,
		]);

	const groupedEnums = enumsList.reduce((acc, it) => {
		if (!(it.oid in acc)) {
			const schemaName = filteredNamespaces.find((sch) => sch.oid === it.schemaId)!.name;
			acc[it.oid] = {
				oid: it.oid,
				schema: schemaName,
				name: it.name,
				values: [it.value],
			};
		} else {
			acc[it.oid].values.push(it.value);
		}
		return acc;
	}, {} as Record<number, { oid: number; schema: string; name: string; values: string[] }>);

	const groupedArrEnums = enumsList.reduce((acc, it) => {
		if (!(it.arrayTypeId in acc)) {
			const schemaName = filteredNamespaces.find((sch) => sch.oid === it.schemaId)!.name;
			acc[it.arrayTypeId] = {
				oid: it.oid,
				schema: schemaName,
				name: it.name,
				values: [it.value],
			};
		} else {
			acc[it.arrayTypeId].values.push(it.value);
		}
		return acc;
	}, {} as Record<number, { oid: number; schema: string; name: string; values: string[] }>);

	for (const it of Object.values(groupedEnums)) {
		enums.push({
			entityType: 'enums',
			schema: it.schema,
			name: it.name,
			values: it.values,
		});
	}

	let columnsCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let tableCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	for (const seq of sequencesList) {
		const depend = dependList.find((it) => it.oid === seq.oid);

		if (depend && (depend.deptype === 'a' || depend.deptype === 'i')) {
			// TODO: add type field to sequence in DDL
			// skip fo sequences or identity columns
			// console.log('skip for auto created', seq.name);
			continue;
		}

		sequences.push({
			entityType: 'sequences',
			schema: namespaces.find((ns) => ns.oid === seq.schemaId)?.name!,
			name: seq.name,
			startWith: parseIdentityProperty(seq.startWith),
			minValue: parseIdentityProperty(seq.minValue),
			maxValue: parseIdentityProperty(seq.maxValue),
			incrementBy: parseIdentityProperty(seq.incrementBy),
			cacheSize: Number(parseIdentityProperty(seq.cacheSize) ?? 1),
		});
	}

	progressCallback('enums', Object.keys(groupedEnums).length, 'done');

	// TODO: drizzle link
	const res = prepareRoles(entities);
	for (const dbRole of rolesList) {
		if (!(res.useRoles || !(res.exclude.includes(dbRole.rolname) || !res.include.includes(dbRole.rolname)))) continue;

		roles.push({
			entityType: 'roles',
			name: dbRole.rolname,
			createDb: dbRole.rolcreatedb,
			createRole: dbRole.rolcreatedb,
		});
	}

	for (const it of policiesList) {
		policies.push({
			entityType: 'policies',
			schema: it.schema,
			table: it.table,
			name: it.name,
			as: it.as,
			for: it.for,
			roles: typeof it.to === 'string' ? it.to.slice(1, -1).split(',') : it.to,
			using: it.using ?? null,
			withCheck: it.withCheck ?? null,
		});
	}

	progressCallback('policies', policiesList.length, 'done');

	type DBColumn = (typeof columnsList)[number];

	for (const column of columnsList.filter((x) => x.kind === 'r' && !x.isHidden)) {
		const table = tablesList.find((it) => it.oid === column.tableId)!;
		const schema = namespaces.find((it) => it.oid === table.schemaId)!;
		const extraColumnConfig = extraColumnDataTypesList.find((it) =>
			it.column_name === column.name && it.table_name === table.name && it.table_schema === schema.name
		)!;

		// supply enums
		const enumType = column.typeId in groupedEnums
			? groupedEnums[column.typeId]
			: column.typeId in groupedArrEnums
			? groupedArrEnums[column.typeId]
			: null;

		let columnTypeMapped;
		const unintrospectedPrecisions = ['vector', 'interval', 'text'];
		if (enumType) {
			columnTypeMapped = enumType.name;
		} else if (unintrospectedPrecisions.find((it) => extraColumnConfig.data_type.startsWith(it))) {
			columnTypeMapped = extraColumnConfig.data_type;
		} else if (column.type.startsWith('text')) {
			// this is because if you create string(200), in pg system tables this will be stored as text(204)
			columnTypeMapped = extraColumnConfig.data_type;
		} else {
			columnTypeMapped = column.type;
		}

		columnTypeMapped = columnTypeMapped.replace('[]', '');

		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}

		const columnDefault = defaultsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		const columnDimensions = Number(column.dimensions);

		const defaultValue = defaultForColumn(
			columnTypeMapped,
			columnDefault?.expression,
			columnDimensions,
			Boolean(enumType),
		);

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			.replace('character', 'char')
			.replace('integer', 'int4')
			.replace('bigint', 'int8')
			.replace('smallint', 'int2')
			.replace('double precision', 'float')
			.replace('text', 'string')
			.replace('numeric', 'decimal');

		columnTypeMapped = trimChar(columnTypeMapped, '"');

		const { type, options } = splitSqlType(columnTypeMapped);

		const unique = constraintsList.find((it) => {
			return it.type === 'u' && it.tableId === column.tableId && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		}) ?? null;

		const pk = constraintsList.find((it) => {
			return it.type === 'p' && it.tableId === column.tableId && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		}) ?? null;

		const metadata = column.metadata;
		if (column.generatedType === 's' && (!metadata || !metadata.expression)) {
			throw new Error(
				`Generated ${schema.name}.${table.name}.${column.name} columns missing expression: \n${
					JSON.stringify(column.metadata)
				}`,
			);
		}

		if (column.identityType !== '' && !metadata) {
			throw new Error(
				`Identity ${schema.name}.${table.name}.${column.name} columns missing metadata: \n${
					JSON.stringify(column.metadata)
				}`,
			);
		}

		const sequence = metadata?.seqId ? sequencesList.find((it) => it.oid === Number(metadata.seqId)) ?? null : null;

		columns.push({
			entityType: 'columns',
			schema: schema.name,
			table: table.name,
			name: column.name,
			type,
			options,
			typeSchema: enumType?.schema ?? null,
			dimensions: columnDimensions,
			default: column.generatedType === 's' || column.identityType ? null : defaultValue,
			unique: !!unique,
			uniqueName: unique ? unique.name : null,
			notNull: column.notNull,
			pk: pk !== null,
			pkName: pk !== null ? pk.name : null,
			generated: column.generatedType === 's' ? { type: 'stored', as: metadata!.expression! } : null,
			identity: column.identityType !== ''
				? {
					type: column.identityType === 'a' ? 'always' : 'byDefault',
					increment: parseIdentityProperty(metadata?.increment),
					minValue: parseIdentityProperty(metadata?.min),
					maxValue: parseIdentityProperty(metadata?.max),
					startWith: parseIdentityProperty(metadata?.start),
					cache: Number(sequence?.cacheSize ?? 1),
				}
				: null,
		});
	}

	for (const pk of constraintsList.filter((it) => it.type === 'p')) {
		const table = tablesList.find((it) => it.oid === pk.tableId)!;
		const schema = namespaces.find((it) => it.oid === pk.schemaId)!;

		// Check if any column in the PK is hidden, skip if so
		const hasHiddenColumn = pk.columnsOrdinals.some((ordinal) => {
			const column = columnsList.find((column) => column.tableId === pk.tableId && column.ordinality === ordinal);
			return !column || column.isHidden; // skip if not found or hidden
		});

		if (hasHiddenColumn) {
			continue;
		}

		const columns: typeof columnsList = [];
		for (const ordinal of pk.columnsOrdinals) {
			const column = columnsList.find((column) => column.tableId == pk.tableId && column.ordinality === ordinal);

			if (!column) {
				continue;
			}

			columns.push(column);
		}

		if (columns.some((c) => c.isHidden)) continue;

		pks.push({
			entityType: 'pks',
			schema: schema.name,
			table: table.name,
			name: pk.name,
			columns: columns.map((c) => c.name),
			nameExplicit: true,
		});
	}

	for (const fk of constraintsList.filter((it) => it.type === 'f')) {
		const table = tablesList.find((it) => it.oid === fk.tableId)!;
		const schema = namespaces.find((it) => it.oid === fk.schemaId)!;
		const tableTo = tablesList.find((it) => it.oid === fk.tableToId)!;

		const columns = fk.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) => column.tableId == fk.tableId && column.ordinality === it)!;
			return column.name;
		});

		const columnsTo = fk.columnsToOrdinals.map((it) => {
			const column = columnsList.find((column) => column.tableId == fk.tableToId && column.ordinality === it)!;
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
			onUpdate: parseOnType(fk.onUpdate),
			onDelete: parseOnType(fk.onDelete),
		});
	}

	for (const check of constraintsList.filter((it) => it.type === 'c')) {
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

	const idxs = await db.query<{
		oid: number;
		schemaId: number;
		name: string;
		accessMethod: string;
		with?: string[];
		metadata: {
			tableId: number;
			expression: string | null;
			where: string;
			columnOrdinals: number[];
			index_def: string;
			opclassIds: number[];
			options: number[];
			isUnique: boolean;
			isPrimary: boolean;
		};
	}>(`
      SELECT
        pg_class.oid,
        relnamespace AS "schemaId",
        relname AS "name",
        am.amname AS "accessMethod",
        reloptions AS "with",
        row_to_json(metadata.*) as "metadata"
      FROM
        pg_class
      JOIN pg_am am ON am.oid = pg_class.relam
      LEFT JOIN LATERAL (
        SELECT
          pg_get_expr(indexprs, indrelid) AS "expression",
          pg_get_expr(indpred, indrelid) AS "where",
          indrelid::int AS "tableId",
          pg_get_indexdef(indexrelid) AS index_def,
          indkey::int[] as "columnOrdinals",
          indclass::int[] as "opclassIds",
          indoption::int[] as "options",
					indisunique as "isUnique",
					indisprimary as "isPrimary"
        FROM
          pg_index
        WHERE
          pg_index.indexrelid = pg_class.oid
      ) metadata ON TRUE
      WHERE
        relkind = 'i' and ${filterByTableIds ? `metadata."tableId" in ${filterByTableIds}` : 'false'}
    `);

	for (const idx of idxs) {
		const { metadata, accessMethod } = idx;

		// filter for drizzle only?
		const forPK = metadata.isPrimary && constraintsList.some((x) => x.type === 'p' && x.indexId === idx.oid);

		const expr = splitExpressions(metadata.expression);

		const schema = namespaces.find((it) => it.oid === idx.schemaId)!;
		const table = tablesList.find((it) => it.oid === idx.metadata.tableId)!;

		const nonColumnsCount = metadata.columnOrdinals.reduce((acc, it) => {
			if (it === 0) acc += 1;
			return acc;
		}, 0);

		if (expr.length !== nonColumnsCount) {
			throw new Error(
				`expression split doesn't match non-columns count: [${
					metadata.columnOrdinals.join(
						', ',
					)
				}] '${metadata.expression}':${expr.length}:${nonColumnsCount}`,
			);
		}

		const opts = metadata.options.map((it) => {
			return {
				descending: (it & 1) === 1,
			};
		});

		const res = [] as (
			& (
				| { type: 'expression'; value: string }
				| { type: 'column'; value: DBColumn }
			)
			& { options: (typeof opts)[number] }
		)[];

		let k = 0;
		for (let i = 0; i < metadata.columnOrdinals.length; i++) {
			const ordinal = metadata.columnOrdinals[i];
			if (ordinal === 0) {
				res.push({
					type: 'expression',
					value: expr[k],
					options: opts[i],
				});
				k += 1;
			} else {
				const column = columnsList.find((column) => {
					return column.tableId == metadata.tableId && column.ordinality === ordinal;
				});

				if (column?.isHidden) continue;
				if (!column) throw new Error(`missing column: ${metadata.tableId}:${ordinal}`);

				res.push({
					type: 'column',
					value: column,
					options: opts[i],
				});
			}
		}

		const columns = res.map((it) => {
			return {
				asc: !it.options.descending,
				isExpression: it.type === 'expression',
				value: it.type === 'expression' ? it.value : it.value.name, // column name
			} satisfies Index['columns'][number];
		});

		const getUsing = (def: string, accessMethod: string): Index['method'] => {
			const regex = /USING\s+(HASH|CSPANN)/gi;

			let match: RegExpExecArray | null;
			while ((match = regex.exec(def)) !== null) {
				const beforeMatch = def.slice(0, match.index);

				// count how many double quotes before this match
				const quoteCount = (beforeMatch.match(/"/g) || []).length;

				// if even number of quotes - outside quotes
				if (quoteCount % 2 === 0) {
					return match[1].toLowerCase();
				}
			}

			if (accessMethod === 'inverted') return 'gin';

			return 'btree';
		};

		const indexAccessMethod = getUsing(metadata.index_def, accessMethod);

		indexes.push({
			entityType: 'indexes',
			schema: schema.name,
			table: table.name,
			name: idx.name,
			nameExplicit: true,
			method: indexAccessMethod,
			isUnique: metadata.isUnique,
			where: idx.metadata.where,
			columns: columns,
			forPK,
		});
	}

	progressCallback('columns', columnsCount, 'fetching');
	progressCallback('checks', checksCount, 'fetching');
	progressCallback('indexes', indexesCount, 'fetching');
	progressCallback('tables', tableCount, 'done');

	for (const it of columnsList.filter((x) => (x.kind === 'm' || x.kind === 'v') && !x.isHidden)) {
		const view = viewsList.find((x) => x.oid === it.tableId)!;
		const schema = namespaces.find((x) => x.oid === view.schemaId)!;

		const enumType = it.typeId in groupedEnums
			? groupedEnums[it.typeId]
			: it.typeId in groupedArrEnums
			? groupedArrEnums[it.typeId]
			: null;

		let columnTypeMapped = enumType ? enumType.name : it.type.replace('[]', '');
		columnTypeMapped = trimChar(columnTypeMapped, '"');
		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}
		for (let i = 0; i < Number(it.dimensions); i++) {
			columnTypeMapped += '[]';
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char')
			.replace('integer', 'int4')
			.replace('bigint', 'int8')
			.replace('smallint', 'int2');

		viewColumns.push({
			schema: schema.name,
			view: view.name,
			name: it.name,
			type: columnTypeMapped,
			notNull: it.notNull,
			dimensions: Number(it.dimensions),
			typeSchema: enumType ? enumType.schema : null,
		});
	}

	for (const view of viewsList) {
		const viewName = view.name;
		if (!tablesFilter(viewName)) continue;
		tableCount += 1;

		const definition = parseViewDefinition(view.definition);

		views.push({
			entityType: 'views',
			schema: namespaces.find((it) => it.oid === view.schemaId)!.name,
			name: view.name,
			definition,
			materialized: view.kind === 'm',
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
		checks,
		sequences,
		roles,
		policies,
		views,
		viewColumns,
	} satisfies InterimSchema;
};

export const fromDatabaseForDrizzle = async (
	db: DB,
	tableFilter: (it: string) => boolean = () => true,
	schemaFilters: (it: string) => boolean = () => true,
	entities?: Entities,
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
) => {
	const res = await fromDatabase(db, tableFilter, schemaFilters, entities, progressCallback);

	res.schemas = res.schemas.filter((it) => it.name !== 'public');
	res.indexes = res.indexes.filter((it) => !it.forPK);

	return res;
};
