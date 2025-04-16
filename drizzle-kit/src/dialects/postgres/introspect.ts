import camelcase from 'camelcase';
import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import type { DB } from '../../utils';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from './ddl';
import {
	defaultForColumn,
	isSystemNamespace,
	parseOnType,
	parseViewDefinition,
	serialExpressionFor,
	splitExpressions,
	stringFromDatabaseIdentityProperty as parseIdentityProperty,
	wrapRecord,
} from './grammar';

const trimChar = (str: string, char: string) => {
	let start = 0;
	let end = str.length;

	while (start < end && str[start] === char) ++start;
	while (end > start && str[end - 1] === char) --end;

	// this.toString() due to ava deep equal issue with String { "value" }
	return start > 0 || end < str.length ? str.substring(start, end) : str.toString();
};

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
export const fromDatabase = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	schemaFilter: (schema: string) => boolean = () => true,
	entities?: {
		roles: boolean | {
			provider?: string | undefined;
			include?: string[] | undefined;
			exclude?: string[] | undefined;
		};
	},
	progressCallback: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void = () => {},
): Promise<InterimSchema> => {
	const schemas: Schema[] = [];
	const enums: Enum[] = [];
	const tables: PostgresEntities['tables'][] = [];
	const columns: Column[] = [];
	const indexes: Index[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const sequences: Sequence[] = [];
	const roles: Role[] = [];
	const policies: Policy[] = [];
	const views: View[] = [];

	type OP = {
		oid: number;
		name: string;
		default: boolean;
	};

	type Namespace = {
		oid: number;
		name: string;
	};

	const opsQuery = db.query<OP>(`
		SELECT 
			pg_opclass.oid as "oid",
			opcdefault as "default", 
			amname as "name"
		FROM pg_opclass
		LEFT JOIN pg_am on pg_opclass.opcmethod = pg_am.oid
		`);

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

	const [ops, tablespaces, namespaces, defaultsList] = await Promise.all([
		opsQuery,
		tablespacesQuery,
		namespacesQuery,
		defaultsQuery,
	]);

	const opsById = ops.reduce((acc, it) => {
		acc[it.oid] = it;
		return acc;
	}, {} as Record<number, OP>);

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
			rlsEnables: boolean;
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

	const filteredTables = tablesList.filter((it) => it.kind === 'r' && tablesFilter(it.name)).map((it) => {
		const schema = filteredNamespaces.find((ns) => ns.oid === it.schemaId)!;
		return {
			...it,
			schema: schema.name,
		};
	});
	const filteredTableIds = filteredTables.map((it) => it.oid);

	for (const table of filteredTables) {
		tables.push({
			entityType: 'tables',
			schema: table.schema,
			name: table.name,
			isRlsEnabled: table.rlsEnables,
		});
	}

	const enumsQuery = db
		.query<{
			oid: number;
			name: string;
			schemaId: number;
			ordinality: number;
			value: string;
		}>(`SELECT
					pg_type.oid as "oid",
					typname as "name",
					typnamespace as "schemaId",
					pg_enum.enumsortorder AS "ordinality",
					pg_enum.enumlabel AS "value"
				FROM
					pg_type
				JOIN pg_enum on pg_enum.enumtypid=pg_type.oid
				WHERE
					pg_type.typtype = 'e'
					AND typnamespace IN (${filteredNamespacesIds.join(',')})
				ORDER BY pg_type.oid, pg_enum.enumsortorder`);

	// fetch for serials, adrelid = tableid
	const serialsQuery = db
		.query<{
			oid: number;
			tableId: number;
			ordinality: number;
			expression: string;
		}>(`SELECT
				oid,
				adrelid as "tableId",
				adnum as "ordinality",
				pg_get_expr(adbin, adrelid) as "expression"
			FROM
				pg_attrdef
			WHERE
				adrelid in (${filteredTableIds.join(', ')})`);

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
				relnamespace as "schemaId",
				relname as "name",
				seqrelid as "oid",
				seqstart as "startWith", 
				seqmin as "minValue", 
				seqmax as "maxValue", 
				seqincrement as "incrementBy", 
				seqcycle as "cycle", 
				seqcache as "cacheSize" 
			FROM pg_sequence
			LEFT JOIN pg_class ON pg_sequence.seqrelid=pg_class.oid ;`);

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
		permissive as "as", 
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
    WHERE conrelid in (${filteredTableIds.join(',')})
  `);

	// for serials match with pg_attrdef via attrelid(tableid)+adnum(ordinal position), for enums with pg_enum above
	const columnsQuery = db.query<{
		tableId: number;
		name: string;
		ordinality: number;
		notNull: boolean;
		type: string;
		dimensions: number;
		typeId: number;
		/* s - stored */
		generatedType: 's' | '';
		/*
		'a' for GENERATED ALWAYS
		'd' for GENERATED BY DEFAULT
		*/
		identityType: 'a' | 'd' | '';
		metadata: {
			seqId: number | null;
			generation: string | null;
			start: string | null;
			increment: string | null;
			max: string | null;
			min: string | null;
			cycle: string;
			generated: 'ALWAYS' | 'BY DEFAULT';
			expression: string | null;
		} | null;
	}>(`SELECT
					attrelid AS "tableId",
					attname AS "name",
					attnum AS "ordinality",
					attnotnull AS "notNull",
					attndims as "dimensions",
					atttypid as "typeId",
					attgenerated as "generatedType", 
					attidentity as "identityType",
					format_type(atttypid, atttypmod) as "type",
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
					END AS "metadata"
				FROM
					pg_attribute attr
					LEFT JOIN pg_class cls ON cls.oid = attr.attrelid
				WHERE
					attrelid IN (${filteredTableIds.join(',')})
					AND attnum > 0
					AND attisdropped = FALSE;`);

	const [enumsList, serialsList, sequencesList, policiesList, rolesList, constraintsList, columnsList] = await Promise.all([
		enumsQuery,
		serialsQuery,
		sequencesQuery,
		policiesQuery,
		rolesQuery,
		constraintsQuery,
		columnsQuery
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

	sequences.push(...sequencesList.map<Sequence>((it) => {
		return {
			entityType: 'sequences',
			schema: namespaces.find((ns) => ns.oid === it.schemaId)?.name!,
			name: it.name,
			startWith: parseIdentityProperty(it.startWith),
			minValue: parseIdentityProperty(it.minValue),
			maxValue: parseIdentityProperty(it.maxValue),
			incrementBy: parseIdentityProperty(it.incrementBy),
			cycle: it.cycle,
			cacheSize: parseIdentityProperty(it.cacheSize),
		};
	}));

	progressCallback('enums', Object.keys(enums).length, 'done');

	// TODO: drizzle link
	const res = prepareRoles(entities);
	for (const dbRole of rolesList) {
		if (!(res.useRoles || !(res.exclude.includes(dbRole.rolname) || !res.include.includes(dbRole.rolname)))) continue;

		roles.push({
			entityType: 'roles',
			name: dbRole.rolname,
			createDb: dbRole.rolcreatedb,
			createRole: dbRole.rolcreatedb,
			inherit: dbRole.rolinherit,
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

	// supply serials
	for (const column of columnsList) {
		const type = column.type;

		if (!(type === 'smallint' || type === 'bigint' || type === 'integer')) {
			continue;
		}

		const expr = serialsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		if (expr) {
			const table = tablesList.find((it) => it.oid === column.tableId)!;
			const schema = namespaces.find((it) => it.oid === table.schemaId)!;

			const expectedExpression = serialExpressionFor(schema.name, table.name, column.name);
			const isSerial = expr.expression === expectedExpression;

			column.type = isSerial ? type === 'bigint' ? 'bigserial' : type === 'integer' ? 'serial' : 'smallserial' : type;
		}
	}

	for (const column of columnsList) {
		const table = tablesList.find((it) => it.oid === column.tableId)!;
		const schema = namespaces.find((it) => it.oid === table.schemaId)!;

		// supply enums
		const typeSchema = column.typeId in groupedEnums ? groupedEnums[column.typeId].schema : null;

		let columnTypeMapped = column.type;

		const columnDefault = defaultsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		const defaultValue = defaultForColumn(
			column.type,
			columnDefault?.expression,
			column.dimensions,
		);
		if (columnTypeMapped.startsWith('numeric(')) {
			columnTypeMapped = columnTypeMapped.replace(',', ', ');
		}

		for (let i = 0; i < column.dimensions; i++) {
			columnTypeMapped += '[]';
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		columnTypeMapped = trimChar(columnTypeMapped, '"');

		const unique = constraintsList.find((it) => {
			return it.type === 'u' && it.tableId === column.tableId && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		}) ?? null;

		const pk = constraintsList.find((it) => {
			return it.type === 'p' && it.tableId === column.tableId && it.columnsOrdinals.length === 1
				&& it.columnsOrdinals.includes(column.ordinality);
		});

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

		const sequence = metadata?.seqId ? sequencesList.find((it) => it.oid === metadata.seqId) : null;

		columns.push({
			entityType: 'columns',
			schema: schema.name,
			table: table.name,
			name: column.name,
			type: column.type,
			typeSchema,
			default: defaultValue,
			unique: unique
				? {
					name: unique.name,
					nullsNotDistinct: unique.definition.includes('NULLS NOT DISTINCT') ?? false,
				}
				: null,
			notNull: column.notNull,
			primaryKey: pk !== null,
			generated: column.generatedType === 's' ? { type: 'stored', as: metadata!.expression! } : null,
			identity: column.identityType !== ''
				? {
					type: column.identityType === 'a' ? 'always' : 'byDefault',
					name: sequence?.name!,
					increment: parseIdentityProperty(metadata?.increment),
					minValue: parseIdentityProperty(metadata?.min),
					maxValue: parseIdentityProperty(metadata?.max),
					startWith: parseIdentityProperty(metadata?.start),
					cycle: metadata?.cycle === 'YES',
					cache: sequence?.cacheSize ?? null,
				}
				: null,
		});
	}

	for (const unique of constraintsList.filter((it) => it.type === 'u')) {
		const table = tablesList.find((it) => it.oid === unique.tableId)!;
		const schema = namespaces.find((it) => it.oid === unique.schemaId)!;

		const columns = unique.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) => column.tableId == unique.tableId && column.ordinality === it)!;
			return column.name;
		});

		uniques.push({
			entityType: 'uniques',
			schema: schema.name,
			table: table.name,
			name: unique.name,
			columns,
			nullsNotDistinct: unique.definition.includes('NULLS NOT DISTINCT'),
		});
	}

	for (const pk of constraintsList.filter((it) => it.type === 'p')) {
		const table = tablesList.find((it) => it.oid === pk.tableId)!;
		const schema = namespaces.find((it) => it.oid === pk.schemaId)!;

		const columns = pk.columnsOrdinals.map((it) => {
			const column = columnsList.find((column) => column.tableId == pk.tableId && column.ordinality === it)!;
			return column.name;
		});

		pks.push({
			entityType: 'pks',
			schema: schema.name,
			table: table.name,
			name: pk.name,
			columns,
			isNameExplicit: true,
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
			tableFrom: table.name,
			columnsFrom: columns,
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
		with: string;
		metadata: {
			tableId: number;
			expression: string | null;
			where: string;
			columnOrdinals: number[];
			opclassIds: number[];
			options: number[];
			isUnique: boolean;
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
          indkey::int[] as "columnOrdinals",
          indclass::int[] as "opclassIds",
          indoption::int[] as "options",
					indisunique as "isUnique"
        FROM
          pg_index
        WHERE
          pg_index.indexrelid = pg_class.oid
      ) metadata ON TRUE
      WHERE
        relkind = 'i' and
        metadata."tableId" IN (${filteredTableIds.join(',')})
    `);

	for (const idx of idxs) {
		const { metadata } = idx;
		const opclasses = metadata.opclassIds.map((it) => opsById[it]!);
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
				nullsFirst: (it & 2) === 2,
			};
		});

		const res = [] as (
			& (
				| { type: 'expression'; value: string }
				| { type: 'column'; value: DBColumn }
			)
			& { options: (typeof opts)[number]; opclass: OP }
		)[];

		let k = 0;
		for (let i = 0; i < metadata.columnOrdinals.length; i++) {
			const ordinal = metadata.columnOrdinals[i];
			if (ordinal === 0) {
				res.push({
					type: 'expression',
					value: expr[k],
					options: opts[i],
					opclass: opclasses[i],
				});
				k += 1;
			} else {
				const column = columnsList.find((column) => {
					return column.tableId == metadata.tableId && column.ordinality === ordinal;
				});
				if (!column) throw new Error(`missing column: ${metadata.tableId}:${ordinal}`);
				res.push({
					type: 'column',
					value: column,
					options: opts[i],
					opclass: opclasses[i],
				});
			}
		}

		const columns = res.map((it) => {
			return {
				asc: !it.options.descending,
				nullsFirst: it.options.nullsFirst,
				opclass: {
					name: it.opclass.name,
					default: it.opclass.default,
				},
				isExpression: it.type === 'expression',
				value: it.type === 'expression' ? it.value : it.value.name, // column name
			} satisfies Index['columns'][number];
		});

		indexes.push({
			entityType: 'indexes',
			schema: schema.name,
			table: table.name,
			name: idx.name,
			method: idx.accessMethod,
			isUnique: false,
			with: idx.with,
			where: idx.metadata.where,
			columns: columns,
			concurrently: false,
		});
	}

	progressCallback('columns', columnsCount, 'fetching');
	progressCallback('checks', checksCount, 'fetching');
	progressCallback('indexes', indexesCount, 'fetching');
	progressCallback('tables', tableCount, 'done');

	for (const view of tablesList.filter((it) => it.kind === 'v' || it.kind === 'm')) {
		const viewName = view.name;
		if (!tablesFilter(viewName)) continue;
		tableCount += 1;

		const accessMethod = view.accessMethod === 0 ? null : ops.find((it) => it.oid === view.accessMethod);
		const tablespace = view.tablespaceid === 0 ? null : tablespaces.find((it) => it.oid === view.tablespaceid)!.name;
		const definition = parseViewDefinition(view.definition);
		const withOpts = wrapRecord(
			view.options?.reduce((acc, it) => {
				const opt = it.split('=');
				if (opt.length !== 2) {
					throw new Error(`Unexpected view option: ${it}`);
				}

				const key = camelcase(opt[0].trim());
				const value = opt[1].trim();
				acc[key] = value;
				return acc;
			}, {} as Record<string, string>) ?? {},
		);

		views.push({
			entityType: 'views',
			schema: namespaces.find((it) => it.oid === view.schemaId)!.name,
			name: view.name,
			definition,
			with: {
				checkOption: withOpts.literal('withCheckOption', ['local', 'cascaded']),
				securityBarrier: withOpts.bool('securityBarrier'),
				securityInvoker: withOpts.bool('securityInvoker'),
				fillfactor: withOpts.num('fillfactor'),
				toastTupleTarget: withOpts.num('toastTupleTarget'),
				parallelWorkers: withOpts.num('parallelWorkers'),
				autovacuumEnabled: withOpts.bool('autovacuumEnabled'),
				vacuumIndexCleanup: withOpts.literal('vacuumIndexCleanup', ['auto', 'on', 'off']),
				vacuumTruncate: withOpts.bool('vacuumTruncate'),
				autovacuumVacuumThreshold: withOpts.num('autovacuumVacuumThreshold'),
				autovacuumVacuumScaleFactor: withOpts.num('autovacuumVacuumScaleFactor'),
				autovacuumVacuumCostDelay: withOpts.num('autovacuumVacuumCostDelay'),
				autovacuumVacuumCostLimit: withOpts.num('autovacuumVacuumCostLimit'),
				autovacuumFreezeMinAge: withOpts.num('autovacuumFreezeMinAge'),
				autovacuumFreezeMaxAge: withOpts.num('autovacuumFreezeMaxAge'),
				autovacuumFreezeTableAge: withOpts.num('autovacuumFreezeTableAge'),
				autovacuumMultixactFreezeMinAge: withOpts.num('autovacuumMultixactFreezeMinAge'),
				autovacuumMultixactFreezeMaxAge: withOpts.num('autovacuumMultixactFreezeMaxAge'),
				autovacuumMultixactFreezeTableAge: withOpts.num('autovacuumMultixactFreezeTableAge'),
				logAutovacuumMinDuration: withOpts.num('logAutovacuumMinDuration'),
				userCatalogTable: withOpts.bool('userCatalogTable'),
			},
			materialized: view.kind === 'm',
			tablespace,
			using: accessMethod
				? {
					name: accessMethod.name,
					default: accessMethod.default,
				}
				: null,
			withNoData: null,
			isExisting: false,
		});
	}

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
		policies,
		views,
	} satisfies InterimSchema;
};
