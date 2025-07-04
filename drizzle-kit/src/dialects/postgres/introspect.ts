import camelcase from 'camelcase';
import type { Entities } from '../../cli/validations/cli';
import type { IntrospectStage, IntrospectStatus } from '../../cli/views';
import { type DB, trimChar } from '../../utils';
import type {
	CheckConstraint,
	Enum,
	ForeignKey,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
	ViewColumn,
} from './ddl';
import {
	defaultForColumn,
	defaults,
	isSerialExpression,
	isSystemNamespace,
	parseOnType,
	parseViewDefinition,
	splitExpressions,
	splitSqlType,
	stringFromDatabaseIdentityProperty as parseIdentityProperty,
	wrapRecord,
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

// TODO: tables/schema/entities -> filter: (entity: {type: ... , metadata: ... }) => boolean;
// TODO: since we by default only introspect public
export const fromDatabase = async (
	db: DB,
	tablesFilter: (schema: string, table: string) => boolean = () => true,
	schemaFilter: (schema: string) => boolean = () => true,
	entities?: Entities,
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
	const policies: Policy[] = [];
	const views: View[] = [];
	const viewColumns: ViewColumn[] = [];

	type OP = {
		oid: number;
		name: string;
		default: boolean;
	};

	type Namespace = {
		oid: number;
		name: string;
	};

	// TODO: potential improvements
	// --- default access method
	// SHOW default_table_access_method;
	// SELECT current_setting('default_table_access_method') AS default_am;

	const accessMethodsQuery = db.query<{ oid: number; name: string }>(
		`SELECT oid, amname as name FROM pg_am WHERE amtype = 't' ORDER BY lower(amname);`,
	).then((rows) => {
		queryCallback('accessMethods', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('accessMethods', [], err);
		throw err;
	});

	const tablespacesQuery = db.query<{
		oid: number;
		name: string;
	}>('SELECT oid, spcname as "name" FROM pg_tablespace ORDER BY lower(spcname)').then((rows) => {
		queryCallback('tablespaces', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('tablespaces', [], err);
		throw err;
	});

	const namespacesQuery = db.query<Namespace>('SELECT oid, nspname as name FROM pg_namespace ORDER BY lower(nspname)')
		.then((rows) => {
			queryCallback('namespaces', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('namespaces', [], err);
			throw err;
		});

	const defaultsQuery = db.query<{
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
	`).then((rows) => {
		queryCallback('defaults', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('defaults', [], err);
		throw err;
	});

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
			schema: string;
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
				relnamespace::regnamespace::text as "schema",
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
				AND relnamespace IN (${filteredNamespacesIds.join(', ')})
			ORDER BY relnamespace, lower(relname);
		`).then((rows) => {
			queryCallback('tables', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('tables', [], err);
			throw err;
		});

	const viewsList = tablesList.filter((it) => it.kind === 'v' || it.kind === 'm');

	const filteredTables = tablesList.filter((it) => {
		if (!(it.kind === 'r' && tablesFilter(it.schema, it.name))) return false;
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
	).then((rows) => {
		queryCallback('depend', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('depend', [], err);
		throw err;
	});

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
			ORDER BY pg_type.oid, pg_enum.enumsortorder
		`).then((rows) => {
			queryCallback('enums', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('enums', [], err);
			throw err;
		});

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
			WHERE ${filterByTableIds ? ` adrelid in ${filterByTableIds}` : 'false'}
		`).then((rows) => {
			queryCallback('serials', rows, null);
			return rows;
		}).catch((err) => {
			queryCallback('serials', [], err);
			throw err;
		});

	const sequencesQuery = db.query<{
		schema: string;
		oid: number;
		name: string;
		startWith: string;
		minValue: string;
		maxValue: string;
		incrementBy: string;
		cycle: boolean;
		cacheSize: number;
	}>(`SELECT 
			relnamespace::regnamespace::text as "schema",
			relname as "name",
			seqrelid as "oid",
			seqstart as "startWith", 
			seqmin as "minValue", 
			seqmax as "maxValue", 
			seqincrement as "incrementBy", 
			seqcycle as "cycle", 
			seqcache as "cacheSize" 
		FROM pg_sequence
		LEFT JOIN pg_class ON pg_sequence.seqrelid=pg_class.oid
		WHERE relnamespace IN (${filteredNamespacesIds.join(',')})
		ORDER BY relnamespace, lower(relname);
	`).then((rows) => {
		queryCallback('sequences', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('sequences', [], err);
		throw err;
	});

	// I'm not yet aware of how we handle policies down the pipeline for push,
	// and since postgres does not have any default policies, we can safely fetch all of them for now
	// and filter them out in runtime, simplifying filterings
	const policiesQuery = db.query<
		{
			schema: string;
			table: string;
			name: string;
			as: Policy['as'];
			to: string | string[];
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
		FROM pg_policies
		ORDER BY lower(schemaname), lower(tablename), lower(policyname);
	`).then((rows) => {
		queryCallback('policies', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('policies', [], err);
		throw err;
	});

const rolesQuery = db.query<
		{
			rolname: string;
			rolsuper: boolean;
			rolinherit: boolean;
			rolcreaterole: boolean;
			rolcreatedb: boolean;
			rolcanlogin: boolean;
			rolreplication: boolean;
			rolconnlimit: number;
			rolpassword: string | null;
			rolvaliduntil: string | null;
			rolbypassrls: boolean;
		}
	>(
		`SELECT
			pg_roles.rolname,
			pg_roles.rolsuper,
			pg_roles.rolinherit,
			pg_roles.rolcreaterole,
			pg_roles.rolcreatedb,
			pg_roles.rolcanlogin,
			pg_roles.rolreplication,
			pg_roles.rolconnlimit,
			pg_authid.rolpassword,
			pg_roles.rolvaliduntil,
			pg_roles.rolbypassrls
		FROM pg_roles
		LEFT JOIN pg_authid ON pg_roles.oid = pg_authid.oid
		ORDER BY lower(pg_roles.rolname);`,
	).then((rows) => {
		queryCallback('roles', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('roles', [], error);
		throw error;
	});

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
		ORDER BY conrelid, contype, lower(conname);
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
		kind: 'r' | 'v' | 'm';
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
	}>(`SELECT
			attrelid AS "tableId",
			relkind AS "kind",
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
								pg_get_serial_sequence('"' || "table_schema" || '"."' || "table_name" || '"', "attname")::regclass::oid as "seqId",
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
								AND c.table_name = cls.relname
						) c
					)
				ELSE NULL
			END AS "metadata"
		FROM
			pg_attribute attr
			LEFT JOIN pg_class cls ON cls.oid = attr.attrelid
		WHERE
		${filterByTableAndViewIds ? ` attrelid in ${filterByTableAndViewIds}` : 'false'}
			AND attnum > 0
			AND attisdropped = FALSE
		ORDER BY attnum;
	`).then((rows) => {
		queryCallback('columns', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('columns', [], err);
		throw err;
	});

	const [dependList, enumsList, serialsList, sequencesList, policiesList, rolesList, constraintsList, columnsList] =
		await Promise
			.all([
				dependQuery,
				enumsQuery,
				serialsQuery,
				sequencesQuery,
				policiesQuery,
				rolesQuery,
				constraintsQuery,
				columnsQuery,
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
			schema: seq.schema,
			name: seq.name,
			startWith: parseIdentityProperty(seq.startWith),
			minValue: parseIdentityProperty(seq.minValue),
			maxValue: parseIdentityProperty(seq.maxValue),
			incrementBy: parseIdentityProperty(seq.incrementBy),
			cycle: seq.cycle,
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
			superuser: dbRole.rolsuper,
			inherit: dbRole.rolinherit,
			createRole: dbRole.rolcreatedb,
			createDb: dbRole.rolcreatedb,
			canLogin: dbRole.rolcanlogin,
			replication: dbRole.rolreplication,
			connLimit: dbRole.rolconnlimit,
			password: dbRole.rolpassword,
			validUntil: dbRole.rolvaliduntil,
			bypassRls: dbRole.rolbypassrls,
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
	for (const column of columnsList.filter((x) => x.kind === 'r')) {
		const type = column.type;

		if (!(type === 'smallint' || type === 'bigint' || type === 'integer')) {
			continue;
		}

		const expr = serialsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		if (expr) {
			const table = tablesList.find((it) => it.oid === column.tableId)!;

			const isSerial = isSerialExpression(expr.expression, table.schema);
			column.type = isSerial ? type === 'bigint' ? 'bigserial' : type === 'integer' ? 'serial' : 'smallserial' : type;
		}
	}

	for (const column of columnsList.filter((x) => x.kind === 'r')) {
		const table = tablesList.find((it) => it.oid === column.tableId)!;

		// supply enums
		const enumType = column.typeId in groupedEnums
			? groupedEnums[column.typeId]
			: column.typeId in groupedArrEnums
			? groupedArrEnums[column.typeId]
			: null;

		let columnTypeMapped = enumType ? enumType.name : column.type.replace('[]', '');

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

		const { type, options } = splitSqlType(columnTypeMapped);

		const columnDefault = defaultsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		const defaultValue = defaultForColumn(
			type,
			columnDefault?.expression,
			column.dimensions,
		);

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
				`Generated ${table.schema}.${table.name}.${column.name} columns missing expression: \n${
					JSON.stringify(column.metadata)
				}`,
			);
		}

		if (column.identityType !== '' && !metadata) {
			throw new Error(
				`Identity ${table.schema}.${table.name}.${column.name} columns missing metadata: \n${
					JSON.stringify(column.metadata)
				}`,
			);
		}

		const sequence = metadata?.seqId ? sequencesList.find((it) => it.oid === Number(metadata.seqId)) ?? null : null;

		columns.push({
			entityType: 'columns',
			schema: table.schema,
			table: table.name,
			name: column.name,
			type,
			options,
			typeSchema: enumType ? enumType.schema ?? 'public' : null,
			dimensions: column.dimensions,
			default: column.generatedType === 's' ? null : defaultValue,
			unique: !!unique,
			uniqueName: unique ? unique.name : null,
			uniqueNullsNotDistinct: unique?.definition.includes('NULLS NOT DISTINCT') ?? false,
			notNull: column.notNull,
			pk: pk !== null,
			pkName: pk !== null ? pk.name : null,
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
					cache: Number(parseIdentityProperty(sequence?.cacheSize)) ?? 1,
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
			nameExplicit: true,
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
		schema: string;
		name: string;
		accessMethod: string;
		with?: string[];
		metadata: {
			tableId: number;
			expression: string | null;
			where: string;
			columnOrdinals: number[];
			opclasses: { oid: number; name: string; default: boolean }[];
			options: number[];
			isUnique: boolean;
			isPrimary: boolean;
		};
	}>(`
      SELECT
        pg_class.oid,
        relnamespace::regnamespace::text as "schema",
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
          indoption::int[] as "options",
          indisunique as "isUnique",
          indisprimary as "isPrimary",
		  array(
			SELECT
			  json_build_object(
				'oid', opclass.oid,
				'name', pg_am.amname,
				'default', pg_opclass.opcdefault
			  )
			FROM
			  unnest(indclass) WITH ORDINALITY AS opclass(oid, ordinality)
			JOIN pg_opclass ON opclass.oid = pg_opclass.oid
			JOIN pg_am ON pg_opclass.opcmethod = pg_am.oid
			ORDER BY opclass.ordinality
		  ) as "opclasses"
        FROM
          pg_index
        WHERE
          pg_index.indexrelid = pg_class.oid
      ) metadata ON TRUE
      WHERE
        relkind = 'i' and ${filterByTableIds ? `metadata."tableId" in ${filterByTableIds}` : 'false'}
	  ORDER BY relnamespace, lower(relname);
    `).then((rows) => {
		queryCallback('indexes', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('indexes', [], err);
		throw err;
	});

	for (const idx of idxs) {
		const { metadata } = idx;

		// filter for drizzle only?
		const forUnique = metadata.isUnique && constraintsList.some((x) => x.type === 'u' && x.indexId === idx.oid);
		const forPK = metadata.isPrimary && constraintsList.some((x) => x.type === 'p' && x.indexId === idx.oid);

		const expr = splitExpressions(metadata.expression);

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
			& { options: (typeof opts)[number]; opclass: { name: string; default: boolean } }
		)[];

		let k = 0;
		for (let i = 0; i < metadata.columnOrdinals.length; i++) {
			const ordinal = metadata.columnOrdinals[i];
			if (ordinal === 0) {
				res.push({
					type: 'expression',
					value: expr[k],
					options: opts[i],
					opclass: metadata.opclasses[i],
				});
				k += 1;
			} else {
				const column = columnsList.find((column) => {
					return column.tableId == metadata.tableId && column.ordinality === ordinal;
				});
				if (!column) throw new Error(`missing column: ${metadata.tableId}:${ordinal}`);

				// ! options and opclass can be undefined when index have "INCLUDE" columns (columns from "INCLUDE" don't have options and opclass)
				const options = opts[i] as typeof opts[number] | undefined;
				const opclass = metadata.opclasses[i] as { name: string; default: boolean } | undefined;
				if (options && opclass) {
					res.push({
						type: 'column',
						value: column,
						options: opts[i],
						opclass: metadata.opclasses[i],
					});
				}
			}
		}

		const columns = res.map((it) => {
			return {
				asc: !it.options.descending,
				nullsFirst: it.options.nullsFirst,
				opclass: it.opclass.default ? null : {
					name: it.opclass.name,
					default: it.opclass.default,
				},
				isExpression: it.type === 'expression',
				value: it.type === 'expression' ? it.value : it.value.name, // column name
			} satisfies Index['columns'][number];
		});

		indexes.push({
			entityType: 'indexes',
			schema: idx.schema,
			table: table.name,
			name: idx.name,
			nameExplicit: true,
			method: idx.accessMethod,
			isUnique: metadata.isUnique,
			with: idx.with?.join(', ') ?? '',
			where: idx.metadata.where,
			columns: columns,
			concurrently: false,
			forUnique,
			forPK,
		});
	}

	progressCallback('columns', columnsCount, 'fetching');
	progressCallback('checks', checksCount, 'fetching');
	progressCallback('indexes', indexesCount, 'fetching');
	progressCallback('tables', tableCount, 'done');

	for (const it of columnsList.filter((x) => x.kind === 'm' || x.kind === 'v')) {
		const view = viewsList.find((x) => x.oid === it.tableId)!;

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
		for (let i = 0; i < it.dimensions; i++) {
			columnTypeMapped += '[]';
		}

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		viewColumns.push({
			schema: view.schema,
			view: view.name,
			name: it.name,
			type: columnTypeMapped,
			notNull: it.notNull,
			dimensions: it.dimensions,
			typeSchema: enumType ? enumType.schema : null,
		});
	}

	for (const view of viewsList) {
		if (!tablesFilter(view.schema, view.name)) continue;
		tableCount += 1;

		const accessMethod = view.accessMethod === 0 ? null : ams.find((it) => it.oid === view.accessMethod);
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

		const opts = {
			checkOption: withOpts.literal('checkOption', ['local', 'cascaded']),
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
		};

		const hasNonNullOpt = Object.values(opts).some((x) => x !== null);
		views.push({
			entityType: 'views',
			schema: view.schema,
			name: view.name,
			definition,
			with: hasNonNullOpt ? opts : null,
			materialized: view.kind === 'm',
			tablespace,
			using: accessMethod
				? {
					name: accessMethod.name,
					default: accessMethod.name === defaults.accessMethod,
				}
				: null,
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
	res.indexes = res.indexes.filter((it) => !it.forPK && !it.forUnique);

	return res;
};
