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
	Privilege,
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
	const privileges: Privilege[] = [];
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

	// ! Use `pg_catalog` for system tables, functions and operators (Prevent security vulnerabilities - overwriting system tables, functions and operators)
	// ! Do not use `::regnamespace::text` to get schema name, because it does not work with schemas that have uppercase letters (e.g. MySchema -> "MySchema")

	// TODO: potential improvements
	// use pg_catalog.has_table_privilege(pg_class.oid, 'SELECT') for tables
	// --- default access method
	// SHOW default_table_access_method;
	// SELECT current_setting('default_table_access_method') AS default_am;

	const accessMethodsQuery = db.query<{ oid: number; name: string }>(
		`SELECT oid, amname as name FROM pg_catalog.pg_am WHERE amtype OPERATOR(pg_catalog.=) 't' ORDER BY pg_catalog.lower(amname);`,
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
	}>(
		`SELECT oid, spcname as "name" FROM pg_catalog.pg_tablespace WHERE pg_catalog.has_tablespace_privilege(oid, 'CREATE') ORDER BY pg_catalog.lower(spcname)`,
	).then((rows) => {
		queryCallback('tablespaces', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('tablespaces', [], err);
		throw err;
	});

	const namespacesQuery = db.query<Namespace>(
		"SELECT oid, nspname as name FROM pg_catalog.pg_namespace WHERE pg_catalog.has_schema_privilege(oid, 'USAGE') ORDER BY pg_catalog.lower(nspname)",
	)
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
	const filteredNamespacesStringForSQL = filteredNamespaces.map((ns) => `'${ns.name}'`).join(',');

	schemas.push(...filteredNamespaces.map<Schema>((it) => ({ entityType: 'schemas', name: it.name })));

	type TableListItem = {
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
	};
	const tablesList = filteredNamespacesStringForSQL
		? await db
			.query<TableListItem>(`
			SELECT
				pg_class.oid,
				nspname as "schema",
				relname AS "name",
				relkind AS "kind",
				relam as "accessMethod",
				reloptions::text[] as "options",
				reltablespace as "tablespaceid",
				relrowsecurity AS "rlsEnabled",
				CASE
					WHEN relkind OPERATOR(pg_catalog.=) 'v' OR relkind OPERATOR(pg_catalog.=) 'm'
						THEN pg_catalog.pg_get_viewdef(pg_class.oid, true)
					ELSE null
				END as "definition"
			FROM
				pg_catalog.pg_class
			JOIN pg_catalog.pg_namespace ON pg_namespace.oid OPERATOR(pg_catalog.=) relnamespace
			WHERE
				relkind IN ('r', 'v', 'm')
				AND nspname IN (${filteredNamespacesStringForSQL})
			ORDER BY pg_catalog.lower(nspname), pg_catalog.lower(relname);
		`).then((rows) => {
				queryCallback('tables', rows, null);
				return rows;
			}).catch((err) => {
				queryCallback('tables', [], err);
				throw err;
			})
		: [] as TableListItem[];

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
			objid as oid,
			refobjid as "tableId",
			refobjsubid as "ordinality",
			deptype
		FROM
			pg_catalog.pg_depend
		WHERE ${filterByTableIds ? ` refobjid IN ${filterByTableIds}` : 'false'};`,
	).then((rows) => {
		queryCallback('depend', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('depend', [], err);
		throw err;
	});

	type EnumListItem = {
		oid: number;
		name: string;
		schema: string;
		arrayTypeId: number;
		ordinality: number;
		value: string;
	};
	const enumsQuery = filteredNamespacesStringForSQL
		? db
			.query<EnumListItem>(`SELECT
				pg_type.oid as "oid",
				typname as "name",
				nspname as "schema",
				pg_type.typarray as "arrayTypeId",
				pg_enum.enumsortorder AS "ordinality",
				pg_enum.enumlabel AS "value"
			FROM
				pg_catalog.pg_type
			JOIN pg_catalog.pg_enum ON pg_enum.enumtypid OPERATOR(pg_catalog.=) pg_type.oid
			JOIN pg_catalog.pg_namespace ON pg_namespace.oid OPERATOR(pg_catalog.=) pg_type.typnamespace
			WHERE
				pg_type.typtype OPERATOR(pg_catalog.=) 'e'
				AND nspname IN (${filteredNamespacesStringForSQL})
			ORDER BY pg_type.oid, pg_enum.enumsortorder
		`).then((rows) => {
				queryCallback('enums', rows, null);
				return rows;
			}).catch((err) => {
				queryCallback('enums', [], err);
				throw err;
			})
		: [] as EnumListItem[];

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

	type SequenceListItem = {
		schema: string;
		oid: number;
		name: string;
		startWith: string;
		minValue: string;
		maxValue: string;
		incrementBy: string;
		cycle: boolean;
		cacheSize: number;
	};
	const sequencesQuery = filteredNamespacesStringForSQL
		? db.query<SequenceListItem>(`SELECT 
			nspname as "schema",
			relname as "name",
			seqrelid as "oid",
			seqstart as "startWith", 
			seqmin as "minValue", 
			seqmax as "maxValue", 
			seqincrement as "incrementBy", 
			seqcycle as "cycle", 
			seqcache as "cacheSize" 
		FROM pg_catalog.pg_sequence
		JOIN pg_catalog.pg_class ON pg_sequence.seqrelid OPERATOR(pg_catalog.=) pg_class.oid
		JOIN pg_catalog.pg_namespace ON pg_namespace.oid OPERATOR(pg_catalog.=) pg_class.relnamespace
		WHERE nspname IN (${filteredNamespacesStringForSQL})
		ORDER BY pg_catalog.lower(nspname), pg_catalog.lower(relname);
	`).then((rows) => {
				queryCallback('sequences', rows, null);
				return rows;
			}).catch((err) => {
				queryCallback('sequences', [], err);
				throw err;
			})
		: [] as SequenceListItem[];

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
		FROM pg_catalog.pg_policies
		ORDER BY
			pg_catalog.lower(schemaname),
			pg_catalog.lower(tablename),
			pg_catalog.lower(policyname);
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
			rolvaliduntil: string | null;
			rolbypassrls: boolean;
		}
	>(
		`SELECT
			rolname,
			rolsuper,
			rolinherit,
			rolcreaterole,
			rolcreatedb,
			rolcanlogin,
			rolreplication,
			rolconnlimit,
			rolvaliduntil,
			rolbypassrls
		FROM pg_catalog.pg_roles
		ORDER BY pg_catalog.lower(rolname);`,
	).then((rows) => {
		queryCallback('roles', rows, null);
		return rows;
	}).catch((error) => {
		queryCallback('roles', [], error);
		throw error;
	});

	type PrivilegeListItem = {
		grantor: string;
		grantee: string;
		schema: string;
		table: string;
		type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'REFERENCES' | 'TRIGGER';
		isGrantable: boolean;
	};
	const privilegesQuery = filteredNamespacesStringForSQL
		? db.query<PrivilegeListItem>(`
		SELECT
			grantor,
			grantee,
			table_schema AS "schema",
			table_name AS "table",
			privilege_type AS "type",
			CASE is_grantable WHEN 'YES' THEN true ELSE false END AS "isGrantable"
		FROM information_schema.role_table_grants
		WHERE table_schema IN (${filteredNamespacesStringForSQL})
		ORDER BY
			pg_catalog.lower(table_schema),
			pg_catalog.lower(table_name),
			pg_catalog.lower(grantee);
	`).then((rows) => {
				queryCallback('privileges', rows, null);
				return rows;
			}).catch((error) => {
				queryCallback('privileges', [], error);
				throw error;
			})
		: [] as PrivilegeListItem[];

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
			pg_catalog.format_type(atttypid, atttypmod) as "type",
			CASE
				WHEN attidentity IN ('a', 'd') or attgenerated OPERATOR(pg_catalog.=) 's' THEN (
					SELECT
						pg_catalog.row_to_json(c.*)
					FROM
						(
							SELECT
								pg_catalog.pg_get_serial_sequence('"' OPERATOR(pg_catalog.||) "table_schema" OPERATOR(pg_catalog.||) '"."' OPERATOR(pg_catalog.||) "table_name" OPERATOR(pg_catalog.||) '"', "attname")::regclass::oid as "seqId",
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
								c.column_name OPERATOR(pg_catalog.=) attname
								AND c.table_schema OPERATOR(pg_catalog.=) nspname
								AND c.table_name OPERATOR(pg_catalog.=) cls.relname
						) c
					)
				ELSE NULL
			END AS "metadata"
		FROM
			pg_catalog.pg_attribute attr
			JOIN pg_catalog.pg_class cls ON cls.oid OPERATOR(pg_catalog.=) attr.attrelid
			JOIN pg_catalog.pg_namespace nsp ON nsp.oid OPERATOR(pg_catalog.=) cls.relnamespace
		WHERE
		${filterByTableAndViewIds ? ` attrelid IN ${filterByTableAndViewIds}` : 'false'}
			AND attnum OPERATOR(pg_catalog.>) 0
			AND attisdropped OPERATOR(pg_catalog.=) FALSE
		ORDER BY attnum;
	`).then((rows) => {
		queryCallback('columns', rows, null);
		return rows;
	}).catch((err) => {
		queryCallback('columns', [], err);
		throw err;
	});

	const [
		dependList,
		enumsList,
		serialsList,
		sequencesList,
		policiesList,
		rolesList,
		privilegesList,
		constraintsList,
		columnsList,
	] = await Promise
		.all([
			dependQuery,
			enumsQuery,
			serialsQuery,
			sequencesQuery,
			policiesQuery,
			rolesQuery,
			privilegesQuery,
			constraintsQuery,
			columnsQuery,
		]);

	const groupedEnums = enumsList.reduce((acc, it) => {
		if (!(it.oid in acc)) {
			acc[it.oid] = {
				oid: it.oid,
				schema: it.schema,
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
			acc[it.arrayTypeId] = {
				oid: it.oid,
				schema: it.schema,
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
			password: null,
			validUntil: dbRole.rolvaliduntil,
			bypassRls: dbRole.rolbypassrls,
		});
	}

	for (const privilege of privilegesList) {
		privileges.push({
			entityType: 'privileges',
			// TODO: remove name and implement custom pk
			name: `${privilege.grantor}_${privilege.grantee}_${privilege.schema}_${privilege.table}_${privilege.type}`,
			grantor: privilege.grantor,
			grantee: privilege.grantee,
			schema: privilege.schema,
			table: privilege.table,
			type: privilege.type,
			isGrantable: privilege.isGrantable,
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

		let columnTypeMapped = enumType ? enumType.name : column.type.replaceAll('[]', '');

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace(' with time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		columnTypeMapped = trimChar(columnTypeMapped, '"');

		const columnDefault = defaultsList.find(
			(it) => it.tableId === column.tableId && it.ordinality === column.ordinality,
		);

		const defaultValue = defaultForColumn(
			columnTypeMapped,
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

		columnTypeMapped += '[]'.repeat(column.dimensions)
		
		columns.push({
			entityType: 'columns',
			schema: table.schema,
			table: table.name,
			name: column.name,
			type: columnTypeMapped,
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
			schemaTo: tableTo.schema,
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
        nspname as "schema",
        relname AS "name",
        am.amname AS "accessMethod",
        reloptions AS "with",
        pg_catalog.row_to_json(metadata.*) as "metadata"
      FROM
        pg_catalog.pg_class
      JOIN pg_catalog.pg_am am ON am.oid OPERATOR(pg_catalog.=) pg_class.relam
	  JOIN pg_catalog.pg_namespace nsp ON nsp.oid OPERATOR(pg_catalog.=) pg_class.relnamespace
      JOIN LATERAL (
        SELECT
          pg_catalog.pg_get_expr(indexprs, indrelid) AS "expression",
          pg_catalog.pg_get_expr(indpred, indrelid) AS "where",
          indrelid::int AS "tableId",
          indkey::int[] as "columnOrdinals",
          indoption::int[] as "options",
          indisunique as "isUnique",
          indisprimary as "isPrimary",
		  array(
			SELECT
			  pg_catalog.json_build_object(
				'oid', opclass.oid,
				'name', pg_am.amname,
				'default', pg_opclass.opcdefault
			  )
			FROM
			  pg_catalog.unnest(indclass) WITH ORDINALITY AS opclass(oid, ordinality)
			JOIN pg_catalog.pg_opclass ON opclass.oid OPERATOR(pg_catalog.=) pg_opclass.oid
			JOIN pg_catalog.pg_am ON pg_opclass.opcmethod OPERATOR(pg_catalog.=) pg_am.oid
			ORDER BY opclass.ordinality
		  ) as "opclasses"
        FROM
          pg_catalog.pg_index
        WHERE
          pg_index.indexrelid OPERATOR(pg_catalog.=) pg_class.oid
      ) metadata ON TRUE
      WHERE
        relkind OPERATOR(pg_catalog.=) 'i'
		AND ${filterByTableIds ? `metadata."tableId" IN ${filterByTableIds}` : 'false'}
	  ORDER BY pg_catalog.lower(nspname), pg_catalog.lower(relname);
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

		columnTypeMapped = columnTypeMapped
			.replace('character varying', 'varchar')
			.replace(' without time zone', '')
			// .replace("timestamp without time zone", "timestamp")
			.replace('character', 'char');

		columnTypeMapped += '[]'.repeat(it.dimensions);

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
		privileges,
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
	res.privileges = [];

	return res;
};
