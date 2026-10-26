import { UnsupportedCommandCliError, UnsupportedSchemaChangeError } from '../../cli/errors';
import type { Column, Index, PostgresDDL, Role, Sequence, Table } from './ddl';
import type { JsonStatement } from './statements';

export const DSQL_SYSTEM_ROLES = ['admin', 'dbowner'];

export const DSQL_REASONS = {
	type: (type: string) => `Aurora DSQL doesn't support the ${type} type`,
	serial: "Aurora DSQL doesn't support serial types. Use uuid or bigint().generatedAlwaysAsIdentity() instead",
	array: "Aurora DSQL doesn't support array columns",
	enum: "Aurora DSQL doesn't support enums. Use text with a check constraint instead",
	varcharLength: 'Aurora DSQL supports varchar lengths from 1 to 65535',
	charLength: 'Aurora DSQL supports char lengths from 1 to 4096',
	numericPrecision: 'Aurora DSQL supports numeric precision from 1 to 1000 and scale from -1000 to 1000',
	numericBare:
		'Aurora DSQL stores numeric without a precision as numeric(18, 6). Set the precision and scale explicitly',
	floatPrecision: 'Aurora DSQL supports float precision from 1 to 53',
	identityType: 'Aurora DSQL supports identity only on bigint columns',
	cache: 'Aurora DSQL requires a CACHE of 1 or at least 65536',
	cacheUnsafe: "drizzle-kit can't represent a CACHE above Number.MAX_SAFE_INTEGER exactly",
	addColumn:
		"Aurora DSQL can't add a column with a default, NOT NULL, identity, generated expression or primary key. Add it without them",
	alterType: "Aurora DSQL can't change the type of a column",
	setNotNull: "Aurora DSQL can't add NOT NULL to an existing column",
	identityNullable: 'Aurora DSQL adds an identity only to a column that is already NOT NULL',
	primaryKey: "Aurora DSQL can't change the primary key of an existing table",
	unique: "Aurora DSQL can't add or change a unique constraint on an existing table. Use a unique index instead",
	indexDesc: "Aurora DSQL doesn't support descending index keys",
	indexOpclass: "Aurora DSQL doesn't support operator classes on index keys",
	indexMethod: 'Aurora DSQL supports only btree indexes',
	indexConcurrently: "Aurora DSQL builds every index asynchronously and doesn't support .concurrently()",
	indexWith: "Aurora DSQL doesn't support index storage parameters",
	keyType: (type: string) => `Aurora DSQL doesn't support ${type} in an index, primary key or unique constraint`,
	rls: "Aurora DSQL doesn't support row-level security",
	policy: "Aurora DSQL doesn't support policies",
	materializedView: "Aurora DSQL doesn't support materialized views",
	roleOption: (option: string) => `Aurora DSQL doesn't support the ${option} role option`,
	systemRole: (name: string) => `${name} is an Aurora DSQL system role. Declare it with .existing()`,
	privilege: (privilege: string) => `Aurora DSQL doesn't support the ${privilege} privilege`,
};

export type DsqlIssue = { statement: JsonStatement['type']; entity: string; reason: string };
type Issue = { entity: string; reason: string };

const NON_KEY_TYPES = ['bytea', 'json', 'jsonb', 'interval', 'time with time zone'];

// The interval fields Postgres accepts.
const INTERVAL =
	/^interval( (year( to month)?|month|day( to (hour|minute|second))?|hour( to (minute|second))?|minute( to second)?|second))?$/;

type ParsedType = { base: string; args: number[] };

// Normalizes a column type the way DSQL names it, so `int4`, `timestamptz` and `interval day to second(3)`
// match the allowlist below. `base` keeps `with time zone`, because `time with time zone` can't be a key.
const parseType = (type: string): ParsedType | null => {
	const match = type.trim().toLowerCase().replace(/\s+/g, ' ').match(
		/^([a-z][a-z0-9_ ]*?)\s*(?:\(\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\))?\s*((?:with|without) time zone)?$/,
	);
	if (!match) return null;
	const [, name, a, b, zone] = match;
	const args = [a, b].filter((it) => it !== undefined).map(Number);

	const aliases: Record<string, string> = {
		int8: 'bigint',
		int: 'integer',
		int4: 'integer',
		int2: 'smallint',
		bool: 'boolean',
		character: 'char',
		bpchar: 'char',
		'character varying': 'varchar',
		decimal: 'numeric',
		dec: 'numeric',
		float4: 'real',
		float8: 'double precision',
		timestamptz: 'timestamp with time zone',
		timetz: 'time with time zone',
	};

	let base = aliases[name] ?? name;
	if (INTERVAL.test(base)) {
		base = 'interval';
	}
	if (base === 'time' || base === 'timestamp') base = zone === 'with time zone' ? `${base} with time zone` : base;
	else if (zone) return null;

	return { base, args };
};

const columnTypeIssues = (column: Column): string[] => {
	if (column.typeSchema) return [DSQL_REASONS.enum];
	if (column.dimensions > 0) return [DSQL_REASONS.array];

	const parsed = parseType(column.type);
	if (!parsed) return [DSQL_REASONS.type(column.type)];
	const { base, args } = parsed;
	const [first, second] = args;
	const unsupported = [DSQL_REASONS.type(column.type)];

	// Postgres takes a second modifier only on numeric, and none at all on uuid, text, bigint and the like.
	if (args.length > 1 && base !== 'numeric') return unsupported;

	switch (base) {
		case 'serial':
		case 'bigserial':
		case 'smallserial':
			return [DSQL_REASONS.serial];
		case 'bigint':
		case 'integer':
		case 'smallint':
		case 'boolean':
		case 'bytea':
		case 'text':
		case 'date':
		case 'json':
		case 'jsonb':
		case 'real':
		case 'double precision':
		case 'uuid':
			return args.length === 0 ? [] : unsupported;
		case 'time':
		case 'time with time zone':
		case 'timestamp':
		case 'timestamp with time zone':
		case 'interval':
			return first === undefined || first >= 0 ? [] : unsupported;
		case 'char':
			return first === undefined || (first >= 1 && first <= 4096) ? [] : [DSQL_REASONS.charLength];
		case 'varchar':
			return first === undefined || (first >= 1 && first <= 65535) ? [] : [DSQL_REASONS.varcharLength];
		case 'numeric':
			if (first === undefined) return [DSQL_REASONS.numericBare];
			return first >= 1 && first <= 1000 && (second === undefined || (second >= -1000 && second <= 1000))
				? []
				: [DSQL_REASONS.numericPrecision];
		case 'float':
			return first === undefined || (first >= 1 && first <= 53) ? [] : [DSQL_REASONS.floatPrecision];
		default:
			return unsupported;
	}
};

const keyTypeOf = (column: Column | null): string | null => {
	if (!column || column.typeSchema || column.dimensions > 0) return null;
	const parsed = parseType(column.type);
	return parsed && NON_KEY_TYPES.includes(parsed.base) ? parsed.base : null;
};

const cacheIssues = (cache: number | null | undefined): string[] => {
	if (cache === null || cache === undefined || !Number.isInteger(cache)) return [DSQL_REASONS.cache];
	if (!Number.isSafeInteger(cache)) return [DSQL_REASONS.cacheUnsafe];
	return cache === 1 || cache >= 65536 ? [] : [DSQL_REASONS.cache];
};

const identityIssues = (column: Column): string[] => {
	if (!column.identity) return [];
	const parsed = parseType(column.type);
	if (parsed?.base !== 'bigint') return [DSQL_REASONS.identityType];
	return cacheIssues(column.identity.cache);
};

const columnIssues = (column: Column): Issue[] => {
	const entity = `${column.schema}.${column.table}.${column.name}`;
	return [...columnTypeIssues(column), ...identityIssues(column)].map((reason) => ({ entity, reason }));
};

const addColumnIssues = (column: Column, isPK: boolean): Issue[] => {
	const entity = `${column.schema}.${column.table}.${column.name}`;
	const constrained = column.notNull || column.default !== null || !!column.generated || !!column.identity || isPK;
	return [
		...columnTypeIssues(column).map((reason) => ({ entity, reason })),
		...(constrained ? [{ entity, reason: DSQL_REASONS.addColumn }] : []),
	];
};

const indexIssues = (index: Index, ddl: PostgresDDL): Issue[] => {
	const entity = `${index.schema}.${index.table}.${index.name}`;
	const reasons: string[] = [];
	if (index.columns.some((it) => !it.asc)) reasons.push(DSQL_REASONS.indexDesc);
	if (index.columns.some((it) => it.opclass && !it.opclass.default)) reasons.push(DSQL_REASONS.indexOpclass);
	if (index.method !== 'btree') reasons.push(DSQL_REASONS.indexMethod);
	if (index.concurrently) reasons.push(DSQL_REASONS.indexConcurrently);
	if (index.with) reasons.push(DSQL_REASONS.indexWith);
	for (const it of index.columns.filter((it) => !it.isExpression)) {
		const column = ddl.columns.one({ schema: index.schema, table: index.table, name: it.value });
		const type = keyTypeOf(column);
		if (type) reasons.push(DSQL_REASONS.keyType(type));
	}
	return reasons.map((reason) => ({ entity, reason }));
};

const keyIssues = (table: Table, name: string, columns: string[]): Issue[] => {
	return columns.flatMap((it) => {
		const type = keyTypeOf(table.columns.find((column) => column.name === it) ?? null);
		return type ? [{ entity: `${table.schema}.${table.name}.${name}`, reason: DSQL_REASONS.keyType(type) }] : [];
	});
};

const roleOptions = (role: Partial<Role>): string[] => {
	const options: string[] = [];
	if (role.superuser) options.push('SUPERUSER');
	if (role.createDb) options.push('CREATEDB');
	if (role.replication) options.push('REPLICATION');
	if (role.bypassRls) options.push('BYPASSRLS');
	if (typeof role.connLimit === 'number' && role.connLimit !== -1) options.push('CONNECTION LIMIT');
	if (role.password) options.push('PASSWORD');
	if (role.validUntil) options.push('VALID UNTIL');
	return options;
};

const UNSUPPORTED_ROLE_FIELDS = [
	['superuser', 'SUPERUSER'],
	['createDb', 'CREATEDB'],
	['replication', 'REPLICATION'],
	['bypassRls', 'BYPASSRLS'],
	['connLimit', 'CONNECTION LIMIT'],
	['password', 'PASSWORD'],
	['validUntil', 'VALID UNTIL'],
] as const;

const systemRoleIssues = (...names: string[]): Issue[] => {
	return names.filter((it) => DSQL_SYSTEM_ROLES.includes(it)).map((it) => ({
		entity: it,
		reason: DSQL_REASONS.systemRole(it),
	}));
};

const privilegeIssues = (privilege: { grantee: string; schema: string; table: string; type: string }): Issue[] => {
	return privilege.type === 'TRUNCATE' || privilege.type === 'REFERENCES'
		? [{
			entity: `${privilege.grantee} on ${privilege.schema}.${privilege.table}`,
			reason: DSQL_REASONS.privilege(privilege.type),
		}]
		: [];
};

const sequenceIssues = (sequence: Sequence): Issue[] => {
	return cacheIssues(sequence.cacheSize).map((reason) => ({ entity: `${sequence.schema}.${sequence.name}`, reason }));
};

const always = (entity: string, reason: string): Issue[] => [{ entity, reason }];
const none = (): Issue[] => [];

type Rules = { [K in JsonStatement['type']]: (st: Extract<JsonStatement, { type: K }>, ddl: PostgresDDL) => Issue[] };

// One rule for every statement kit can produce, so a new statement type fails to compile until it has one.
const rules: Rules = {
	create_table: ({ table }) => [
		...table.columns.flatMap(columnIssues),
		...(table.pk ? keyIssues(table, table.pk.name, table.pk.columns) : []),
		...table.uniques.flatMap((it) => keyIssues(table, it.name, it.columns)),
		...(table.isRlsEnabled || table.policies.length > 0
			? always(`${table.schema}.${table.name}`, DSQL_REASONS.rls)
			: []),
	],
	drop_table: ({ table }) =>
		table.policies.length > 0 ? always(`${table.schema}.${table.name}`, DSQL_REASONS.policy) : [],
	rename_table: none,
	move_table: none,
	rename_column: none,
	add_column: ({ column, isPK }) => addColumnIssues(column, isPK),
	drop_column: none,
	alter_column: ({ to, diff }) => {
		const entity = `${to.schema}.${to.table}.${to.name}`;
		const reasons: string[] = [];
		if (diff.type || diff.typeSchema || diff.dimensions) reasons.push(DSQL_REASONS.alterType);
		else reasons.push(...columnTypeIssues(to));
		if (diff.notNull?.to) reasons.push(DSQL_REASONS.setNotNull);
		if (diff.identity && diff.identity.from === null && !diff.$left.notNull) {
			reasons.push(DSQL_REASONS.identityNullable);
		}
		if (diff.identity?.to) reasons.push(...identityIssues(to));
		return reasons.map((reason) => ({ entity, reason }));
	},
	recreate_column: ({ diff, isPK }) => addColumnIssues(diff.$right, isPK),
	create_index: ({ index }, ddl) => indexIssues(index, ddl),
	recreate_index: ({ index }, ddl) => indexIssues(index, ddl),
	drop_index: none,
	rename_index: none,
	add_pk: ({ pk }) => always(`${pk.schema}.${pk.table}.${pk.name}`, DSQL_REASONS.primaryKey),
	drop_pk: ({ pk }) => always(`${pk.schema}.${pk.table}.${pk.name}`, DSQL_REASONS.primaryKey),
	alter_pk: ({ pk }) => always(`${pk.schema}.${pk.table}.${pk.name}`, DSQL_REASONS.primaryKey),
	rename_constraint: none,
	create_fk: none,
	recreate_fk: none,
	drop_fk: none,
	add_unique: ({ unique }) => always(`${unique.schema}.${unique.table}.${unique.name}`, DSQL_REASONS.unique),
	alter_unique: ({ diff }) => always(`${diff.schema}.${diff.table}.${diff.name}`, DSQL_REASONS.unique),
	drop_unique: none,
	add_check: none,
	alter_check: none,
	drop_check: none,
	create_schema: none,
	drop_schema: none,
	rename_schema: none,
	create_sequence: ({ sequence }) => sequenceIssues(sequence),
	alter_sequence: ({ sequence }) => sequenceIssues(sequence),
	rename_sequence: none,
	move_sequence: none,
	drop_sequence: none,
	create_enum: (st) => always(`${st.enum.schema}.${st.enum.name}`, DSQL_REASONS.enum),
	drop_enum: (st) => always(`${st.enum.schema}.${st.enum.name}`, DSQL_REASONS.enum),
	rename_enum: (st) => always(`${st.schema}.${st.from}`, DSQL_REASONS.enum),
	move_enum: (st) => always(`${st.from.schema}.${st.from.name}`, DSQL_REASONS.enum),
	alter_enum: (st) => always(`${st.from.schema}.${st.from.name}`, DSQL_REASONS.enum),
	recreate_enum: (st) => always(`${st.from.schema}.${st.from.name}`, DSQL_REASONS.enum),
	create_policy: ({ policy }) => always(`${policy.schema}.${policy.table}.${policy.name}`, DSQL_REASONS.policy),
	drop_policy: ({ policy }) => always(`${policy.schema}.${policy.table}.${policy.name}`, DSQL_REASONS.policy),
	rename_policy: ({ from }) => always(`${from.schema}.${from.table}.${from.name}`, DSQL_REASONS.policy),
	alter_policy: ({ policy }) => always(`${policy.schema}.${policy.table}.${policy.name}`, DSQL_REASONS.policy),
	recreate_policy: ({ policy }) => always(`${policy.schema}.${policy.table}.${policy.name}`, DSQL_REASONS.policy),
	alter_rls: (st) => always(`${st.schema}.${st.name}`, DSQL_REASONS.rls),
	create_view: ({ view }) =>
		view.materialized ? always(`${view.schema}.${view.name}`, DSQL_REASONS.materializedView) : [],
	drop_view: ({ view }) =>
		view.materialized ? always(`${view.schema}.${view.name}`, DSQL_REASONS.materializedView) : [],
	rename_view: ({ from }) =>
		from.materialized ? always(`${from.schema}.${from.name}`, DSQL_REASONS.materializedView) : [],
	move_view: ({ view, fromSchema }) =>
		view.materialized ? always(`${fromSchema}.${view.name}`, DSQL_REASONS.materializedView) : [],
	alter_view: ({ view }) =>
		view.materialized ? always(`${view.schema}.${view.name}`, DSQL_REASONS.materializedView) : [],
	create_role: ({ role }) => {
		const system = systemRoleIssues(role.name);
		if (system.length > 0) return system;
		return roleOptions(role).map((it) => ({ entity: role.name, reason: DSQL_REASONS.roleOption(it) }));
	},
	alter_role: ({ role, diff }) => {
		const system = systemRoleIssues(role.name);
		if (system.length > 0) return system;
		return UNSUPPORTED_ROLE_FIELDS.filter(([field]) => diff[field]).map(([, option]) => ({
			entity: role.name,
			reason: DSQL_REASONS.roleOption(option),
		}));
	},
	rename_role: ({ from, to }) => systemRoleIssues(from.name, to.name),
	drop_role: ({ role }) => systemRoleIssues(role.name),
	grant_privilege: ({ privilege }) => privilegeIssues(privilege),
	revoke_privilege: ({ privilege }) => privilegeIssues(privilege),
	regrant_privilege: ({ privilege }) => privilegeIssues(privilege),
};

export const dsqlIssues = (statements: JsonStatement[], ddl: PostgresDDL): DsqlIssue[] => {
	return statements.flatMap((st) => {
		const rule = rules[st.type] as (st: JsonStatement, ddl: PostgresDDL) => Issue[];
		return rule(st, ddl).map((it) => ({ statement: st.type, ...it }));
	});
};

const tableKey = (schema: string, table: string) => schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

const validateConstraint = (schema: string, table: string, name: string) => {
	return `ALTER TABLE ASYNC ${tableKey(schema, table)} VALIDATE CONSTRAINT "${name}";`;
};

// Rewrites one statement of beta's SQL. A convertor change that breaks the expected shape throws, so it can't
// silently emit SQL that DSQL rejects.
const rewrite = (type: JsonStatement['type'], sql: string, from: RegExp, to: string) => {
	if (!from.test(sql)) throw new Error(`expected beta's ${type} SQL to match ${from}: ${sql}`);
	return sql.replace(from, to);
};

const asyncIndex = (sql: string, type: JsonStatement['type']) => {
	return rewrite(type, sql, /^CREATE (UNIQUE )?INDEX "/, 'CREATE $1INDEX ASYNC "');
};

const notValid = (sql: string, type: JsonStatement['type']) => rewrite(type, sql, /;$/, ' NOT VALID;');

const dropIfExists = (sql: string, type: JsonStatement['type'], from: RegExp, to: string) => {
	return rewrite(type, sql, from, to);
};

const render = (st: JsonStatement, sql: string[]): string[] => {
	switch (st.type) {
		case 'create_index':
			return sql.map((it) => asyncIndex(it, st.type));
		case 'recreate_index': {
			const [drop, create, ...rest] = sql;
			if (rest.length > 0 || !drop || !create) throw new Error(`expected beta's recreate_index SQL: ${sql}`);
			return [dropIfExists(drop, st.type, /^DROP INDEX /, 'DROP INDEX IF EXISTS '), asyncIndex(create, st.type)];
		}
		case 'create_fk':
			return [...sql.map((it) => notValid(it, st.type)), validateConstraint(st.fk.schema, st.fk.table, st.fk.name)];
		case 'recreate_fk':
			return [
				...sql.map((it) =>
					notValid(dropIfExists(it, st.type, / DROP CONSTRAINT "/, ' DROP CONSTRAINT IF EXISTS "'), st.type)
				),
				validateConstraint(st.fk.schema, st.fk.table, st.fk.name),
			];
		case 'add_check':
			return [
				...sql.map((it) => notValid(it, st.type)),
				validateConstraint(st.check.schema, st.check.table, st.check.name),
			];
		case 'alter_check': {
			const check = st.diff.$right;
			return [
				...sql.map((it) =>
					notValid(dropIfExists(it, st.type, / DROP CONSTRAINT "/, ' DROP CONSTRAINT IF EXISTS "'), st.type)
				),
				validateConstraint(check.schema, check.table, check.name),
			];
		}
		default:
			return sql;
	}
};

// Turns the result of `ddlDiff` into SQL Aurora DSQL runs. It throws one error that lists every change DSQL
// can't make, before any SQL is written or executed. `ddl` is the target state, for column lookups.
export const toDsql = <
	T extends {
		statements: JsonStatement[];
		groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
		sqlStatements: string[];
	},
>(result: T, ddl: PostgresDDL): T => {
	const issues = dsqlIssues(result.statements, ddl);
	if (issues.length > 0) throw new UnsupportedSchemaChangeError({ kind: 'dsql_unsupported', issues });

	const groupedStatements = result.groupedStatements.map((it) => ({
		jsonStatement: it.jsonStatement,
		sqlStatements: render(it.jsonStatement, it.sqlStatements),
	}));

	return { ...result, groupedStatements, sqlStatements: groupedStatements.flatMap((it) => it.sqlStatements) };
};

// Aurora DSQL runs one DDL statement per transaction, and the migrator runs each breakpoint chunk as one
// statement.
export const assertDsqlBreakpoints = (command: 'generate' | 'pull', breakpoints: boolean) => {
	if (breakpoints) return;
	throw new UnsupportedCommandCliError(
		command,
		"Aurora DSQL runs one DDL statement per transaction, so `breakpoints` must stay enabled with driver 'dsql'",
		{ dialect: 'postgresql', option: 'breakpoints' },
	);
};
