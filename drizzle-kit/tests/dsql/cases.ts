import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	bytea,
	char,
	check,
	customType,
	date,
	doublePrecision,
	foreignKey,
	index,
	inet,
	integer,
	interval,
	json,
	jsonb,
	numeric,
	pgPolicy,
	pgRole,
	pgSchema,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { DSQL_REASONS } from 'src/dialects/postgres/dsql';
import type { JsonStatement } from 'src/dialects/postgres/statements';

type Issue = { statement: JsonStatement['type']; entity: string; reason: string };

// DSQL's answer to the plain Postgres SQL that the rule exists for. `ok` proves the setup is right, so a
// canary can't pass because of a missing table.
export type Canary = {
	setup: string[];
	ok: string;
	rejected: string;
	sqlstate: string;
	message: string;
};

export type DsqlCase = {
	name: string;
	// The schemas kit diffs. Absent for a `direct` case.
	from?: Record<string, unknown>;
	to?: Record<string, unknown>;
	renames?: string[];
	// Statements no pg-core schema produces today, fed to `toDsql` as they are.
	direct?: JsonStatement[];
	// The SQL `toDsql` must emit. Absent when the case keeps beta's SQL unchanged.
	sql?: string[];
	issues?: Issue[];
	canary?: Canary;
	// More canaries, for the other rules a case checks.
	canaries?: Canary[];
	// How the live suite proves a `direct` case's SQL works: `setup`, then the SQL, then `check` must return
	// every row in `includes` and none in `excludes`.
	live?: { setup: string[]; check: string; includes?: string[]; excludes?: string[] };
	// Checked offline only, because kit reads these types back differently from any Postgres, so push would
	// never settle.
	offline?: true;
	// push ignores this change on purpose, so only generate rejects it.
	pushIgnores?: true;
	// Roles the case creates, so the live suite can drop them.
	roles?: string[];
};

const float = customType<{ data: number; config: { precision: number } }>({
	dataType: (config) => `float(${config?.precision})`,
});
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const raw = (type: string) => customType<{ data: unknown }>({ dataType: () => type })();

// Every case for every statement type kit can produce. `satisfies` makes a new statement type a compile
// error here until it has a case.
export const dsqlCases = (s: string) => {
	const schema = pgSchema(s);
	const s2 = `${s}_2`;
	const schema2 = pgSchema(s2);
	const q = (name: string) => `"${s}"."${name}"`;
	const role = (name: string) => `${s}_${name}`;

	const base = () =>
		schema.table('base', {
			id: uuid().primaryKey(),
			a: integer(),
			b: bigint({ mode: 'number' }).notNull(),
			c: text(),
			j: jsonb(),
		});

	const parent = () => schema.table('parent', { id: uuid().primaryKey() });
	const child = (onDelete?: 'cascade') =>
		schema.table('child', {
			id: uuid().primaryKey(),
			parentId: uuid('parent_id'),
		}, (t) => [
			foreignKey({ name: 'child_parent_fk', columns: [t.parentId], foreignColumns: [parent().id] }).onDelete(
				onDelete ?? 'no action',
			),
		]);

	const validate = (table: string, name: string) => `ALTER TABLE ASYNC ${q(table)} VALIDATE CONSTRAINT "${name}";`;

	const reject = (statement: JsonStatement['type'], entity: string, reason: string): Issue => ({
		statement,
		entity,
		reason,
	});

	const roleRow = (name: string, overrides: Record<string, unknown> = {}) => ({
		entityType: 'roles' as const,
		name,
		superuser: false,
		createDb: false,
		createRole: false,
		inherit: true,
		canLogin: false,
		replication: false,
		bypassRls: false,
		connLimit: -1,
		password: null,
		validUntil: null,
		...overrides,
	});

	const privilege = (type: string) => ({
		entityType: 'privileges' as const,
		grantor: 'admin',
		grantee: role('grantee'),
		schema: s,
		table: 'base',
		type,
		isGrantable: false,
	});

	const cases = {
		create_table: [
			{
				name: 'create a table with every supported column type',
				from: { schema },
				to: {
					schema,
					t: schema.table('types', {
						id: uuid().primaryKey().defaultRandom(),
						big: bigint({ mode: 'number' }),
						int: integer().default(1),
						small: smallint(),
						bool: boolean().notNull().default(false),
						bin: bytea(),
						ch: char(),
						ch1: char({ length: 1 }),
						ch5: char({ length: 5 }),
						ch4096: char({ length: 4096 }),
						vc: varchar(),
						vc1: varchar({ length: 1 }),
						vc20: varchar({ length: 20 }),
						vc65535: varchar({ length: 65535 }),
						txt: text().notNull(),
						d: date(),
						tm: time(),
						tmtz: time({ precision: 3, withTimezone: true }),
						ts: timestamp(),
						tstz: timestamp({ precision: 3, withTimezone: true }).defaultNow(),
						iv: interval(),
						ivf: interval({ fields: 'day to second', precision: 3 }),
						js: json(),
						jsb: jsonb(),
						num: numeric({ precision: 10, scale: 2 }),
						num1: numeric({ precision: 1 }),
						num1000: numeric({ precision: 1000, scale: -1000 }),
						r: real(),
						dp: doublePrecision(),
						gen: integer().generatedAlwaysAs(sql`1 + 1`),
					}),
				},
			},
			{
				name: 'accept type aliases and float precision limits',
				offline: true,
				from: { schema },
				to: {
					schema,
					t: schema.table('aliases', {
						id: uuid().primaryKey(),
						i4: raw('int4'),
						int: raw('int'),
						upper: raw('INT4'),
						ch3: raw('character(3)'),
						spaced: raw('double  precision'),
						i8: raw('int8'),
						i2: raw('int2'),
						f4: raw('float4'),
						f8: raw('float8'),
						f1: raw('float(1)'),
						f53: raw('float(53)'),
						b: raw('bool'),
						tstz: raw('timestamptz'),
						ttz: raw('timetz'),
						bp: raw('bpchar(3)'),
						cv: raw('character varying(10)'),
						dec: raw('dec(5, 2)'),
						dc: raw('decimal(5, 2)'),
						ym: raw('interval year to month'),
						tnz: raw('time(3) without time zone'),
						ts6: raw('timestamp(6) with time zone'),
					}),
				},
			},
			{
				name: 'create a table with an identity, constraints and a composite primary key',
				from: { schema },
				to: {
					schema,
					t: schema.table('constrained', {
						a: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ cache: 65536 }),
						b: text().notNull().unique(),
						c: integer(),
						d: integer(),
					}, (t) => [
						primaryKey({ columns: [t.a, t.c] }),
						unique('constrained_c_d_unique').on(t.c, t.d).nullsNotDistinct(),
						check('constrained_c_check', sql`${t.c} > 0`),
					]),
				},
			},
			{
				name: 'create a table with an identity with CACHE 1',
				from: { schema },
				to: {
					schema,
					t: schema.table('identity1', {
						id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity({ cache: 1 }),
					}),
				},
			},
			{
				name: 'reject unsupported column types',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_ci_ok')} ("id" uuid PRIMARY KEY)`,
						rejected: `CREATE TABLE ${q('cn_ci')} ("id" uuid PRIMARY KEY, "x" citext)`,
						sqlstate: '42704',
						message: 'type "citext" does not exist',
					},
				],
				from: { schema },
				to: {
					schema,
					t: schema.table('bad_types', {
						id: uuid().primaryKey(),
						s: serial(),
						ip: inet(),
						arr: integer().array(),
						ci: citext(),
						geo: raw('geometry(point, 4326)'),
						zoned: raw('integer with time zone'),
						modded: raw('uuid(4)'),
						twoArgs: raw('varchar(3, 4)'),
						negative: raw('time(-1)'),
						backwards: raw('interval second to hour'),
					}),
				},
				issues: [
					reject('create_table', `${s}.bad_types.s`, DSQL_REASONS.serial),
					reject('create_table', `${s}.bad_types.ip`, DSQL_REASONS.type('inet')),
					reject('create_table', `${s}.bad_types.arr`, DSQL_REASONS.array),
					reject('create_table', `${s}.bad_types.ci`, DSQL_REASONS.type('citext')),
					reject('create_table', `${s}.bad_types.geo`, DSQL_REASONS.type('geometry(point,4326)')),
					reject('create_table', `${s}.bad_types.zoned`, DSQL_REASONS.type('integer with time zone')),
					reject('create_table', `${s}.bad_types.modded`, DSQL_REASONS.type('uuid(4)')),
					reject('create_table', `${s}.bad_types.twoArgs`, DSQL_REASONS.type('varchar(3,4)')),
					reject('create_table', `${s}.bad_types.negative`, DSQL_REASONS.type('time(-1)')),
					reject('create_table', `${s}.bad_types.backwards`, DSQL_REASONS.type('interval second to hour')),
				],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_types')} ("id" uuid PRIMARY KEY, "x" integer)`,
					rejected: `CREATE TABLE ${q('canary_types2')} ("id" uuid PRIMARY KEY, "x" inet)`,
					sqlstate: '0A000',
					message: 'datatype inet not supported',
				},
			},
			{
				name: 'reject an enum column',
				from: { schema, e: schema.enum('mood', ['happy']) },
				to: {
					schema,
					e: schema.enum('mood', ['happy']),
					t: schema.table('enum_t', { id: uuid().primaryKey(), m: schema.enum('mood', ['happy'])() }),
				},
				issues: [reject('create_table', `${s}.enum_t.m`, DSQL_REASONS.enum)],
			},
			{
				name: 'reject serial',
				from: { schema },
				to: { schema, t: schema.table('serial_t', { id: serial().primaryKey() }) },
				issues: [reject('create_table', `${s}.serial_t.id`, DSQL_REASONS.serial)],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_serial')} ("id" bigint PRIMARY KEY)`,
					rejected: `CREATE TABLE ${q('canary_serial2')} ("id" serial PRIMARY KEY)`,
					sqlstate: '42704',
					message: 'type "serial" does not exist',
				},
			},
			{
				name: 'reject array columns',
				from: { schema },
				to: { schema, t: schema.table('arr_t', { id: uuid().primaryKey(), x: text().array() }) },
				issues: [reject('create_table', `${s}.arr_t.x`, DSQL_REASONS.array)],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_arr')} ("id" uuid PRIMARY KEY, "x" text)`,
					rejected: `CREATE TABLE ${q('canary_arr2')} ("id" uuid PRIMARY KEY, "x" text[])`,
					sqlstate: '0A000',
					message: 'datatype text[] not supported',
				},
			},
			{
				name: 'reject type modifiers outside DSQL limits',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_ch_ok')} ("id" uuid PRIMARY KEY, "x" char(4096))`,
						rejected: `CREATE TABLE ${q('cn_ch')} ("id" uuid PRIMARY KEY, "x" char(4097))`,
						sqlstate: '54000',
						message: 'Datatype limit greater than 4096 bytes not supported for char',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_num_ok')} ("id" uuid PRIMARY KEY, "x" numeric(1000))`,
						rejected: `CREATE TABLE ${q('cn_num')} ("id" uuid PRIMARY KEY, "x" numeric(1001))`,
						sqlstate: '22023',
						message: 'NUMERIC precision 1001 must be between 1 and 1000',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_fl_ok')} ("id" uuid PRIMARY KEY, "x" float(53))`,
						rejected: `CREATE TABLE ${q('cn_fl')} ("id" uuid PRIMARY KEY, "x" float(54))`,
						sqlstate: '22023',
						message: 'precision for type float must be less than 54 bits',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_vc0_ok')} ("id" uuid PRIMARY KEY, "x" varchar(1))`,
						rejected: `CREATE TABLE ${q('cn_vc0')} ("id" uuid PRIMARY KEY, "x" varchar(0))`,
						sqlstate: '22023',
						message: 'length for type varchar must be at least 1',
					},
				],
				from: { schema },
				to: {
					schema,
					t: schema.table('limits', {
						id: uuid().primaryKey(),
						vc: varchar({ length: 65536 }),
						vc0: varchar({ length: 0 }),
						ch: char({ length: 4097 }),
						ch0: char({ length: 0 }),
						np: numeric({ precision: 1001 }),
						ns: numeric({ precision: 10, scale: 1001 }),
						nneg: numeric({ precision: 10, scale: -1001 }),
						f0: float({ precision: 0 }),
						f54: float({ precision: 54 }),
					}),
				},
				issues: [
					reject('create_table', `${s}.limits.vc`, DSQL_REASONS.varcharLength),
					reject('create_table', `${s}.limits.vc0`, DSQL_REASONS.varcharLength),
					reject('create_table', `${s}.limits.ch`, DSQL_REASONS.charLength),
					reject('create_table', `${s}.limits.ch0`, DSQL_REASONS.charLength),
					reject('create_table', `${s}.limits.np`, DSQL_REASONS.numericPrecision),
					reject('create_table', `${s}.limits.ns`, DSQL_REASONS.numericPrecision),
					reject('create_table', `${s}.limits.nneg`, DSQL_REASONS.numericPrecision),
					reject('create_table', `${s}.limits.f0`, DSQL_REASONS.floatPrecision),
					reject('create_table', `${s}.limits.f54`, DSQL_REASONS.floatPrecision),
				],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_vc')} ("id" uuid PRIMARY KEY, "x" varchar(65535))`,
					rejected: `CREATE TABLE ${q('canary_vc2')} ("id" uuid PRIMARY KEY, "x" varchar(65536))`,
					sqlstate: '54000',
					message: 'Datatype limit greater than 65535 bytes not supported for varchar',
				},
			},
			{
				name: 'reject numeric without precision',
				from: { schema },
				to: { schema, t: schema.table('bare_numeric', { id: uuid().primaryKey(), n: numeric() }) },
				issues: [reject('create_table', `${s}.bare_numeric.n`, DSQL_REASONS.numericBare)],
			},
			{
				name: 'reject identity on a non-bigint column',
				from: { schema },
				to: {
					schema,
					t: schema.table('int_identity', { id: integer().primaryKey().generatedAlwaysAsIdentity() }),
				},
				issues: [reject('create_table', `${s}.int_identity.id`, DSQL_REASONS.identityType)],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_ident')} ("id" bigint GENERATED ALWAYS AS IDENTITY (sequence name ${
						q('canary_ident_seq')
					} CACHE 1) PRIMARY KEY)`,
					rejected: `CREATE TABLE ${q('canary_ident2')} ("id" integer GENERATED ALWAYS AS IDENTITY (sequence name ${
						q('canary_ident2_seq')
					} CACHE 1) PRIMARY KEY)`,
					sqlstate: '0A000',
					message: 'identity column type must be bigint',
				},
			},
			{
				name: 'reject an identity CACHE DSQL refuses',
				from: { schema },
				to: {
					schema,
					t: schema.table('cache_identity', {
						id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity({ cache: 100 }),
						below: bigint({ mode: 'number' }).generatedByDefaultAsIdentity({ cache: 65535 }),
					}),
				},
				issues: [
					reject('create_table', `${s}.cache_identity.id`, DSQL_REASONS.cache),
					reject('create_table', `${s}.cache_identity.below`, DSQL_REASONS.cache),
				],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_cache')} ("id" bigint GENERATED ALWAYS AS IDENTITY (sequence name ${
						q('canary_cache_seq')
					} CACHE 65536) PRIMARY KEY)`,
					rejected: `CREATE TABLE ${q('canary_cache2')} ("id" bigint GENERATED ALWAYS AS IDENTITY (sequence name ${
						q('canary_cache2_seq')
					} CACHE 100) PRIMARY KEY)`,
					sqlstate: '22023',
					message: 'CACHE (100) must be greater than or equal to 65536 or equal to 1',
				},
			},
			{
				name: "reject an identity CACHE kit can't represent exactly",
				from: { schema },
				to: {
					schema,
					t: schema.table('unsafe_cache', {
						id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity({
							cache: Number.MAX_SAFE_INTEGER + 2,
						}),
					}),
				},
				issues: [reject('create_table', `${s}.unsafe_cache.id`, DSQL_REASONS.cacheUnsafe)],
			},
			{
				name: "reject keys on types DSQL can't index",
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_k_ok')} ("id" uuid PRIMARY KEY, "x" text UNIQUE)`,
						rejected: `CREATE TABLE ${q('cn_k_b')} ("id" uuid PRIMARY KEY, "x" bytea UNIQUE)`,
						sqlstate: '0A000',
						message: 'datatype bytea is not supported in a key',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_k_ok')} ("id" uuid PRIMARY KEY, "x" text UNIQUE)`,
						rejected: `CREATE TABLE ${q('cn_k_j')} ("id" uuid PRIMARY KEY, "x" json UNIQUE)`,
						sqlstate: '0A000',
						message: 'datatype json is not supported in a key',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_k_ok')} ("id" uuid PRIMARY KEY, "x" text UNIQUE)`,
						rejected: `CREATE TABLE ${q('cn_k_iv')} ("id" uuid PRIMARY KEY, "x" interval UNIQUE)`,
						sqlstate: '0A000',
						message: 'datatype interval is not supported in a key',
					},
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_k_ok')} ("id" uuid PRIMARY KEY, "x" text UNIQUE)`,
						rejected: `CREATE TABLE ${q('cn_k_tz')} ("id" uuid PRIMARY KEY, "x" time with time zone UNIQUE)`,
						sqlstate: '0A000',
						message: 'datatype time with time zone is not supported in a key',
					},
				],
				from: { schema },
				to: {
					schema,
					t: schema.table('bad_keys', {
						j: jsonb().primaryKey(),
						b: bytea().unique(),
						js: json().unique(),
						iv: interval().unique(),
						tz: time({ withTimezone: true }).unique(),
					}),
				},
				issues: [
					reject('create_table', `${s}.bad_keys.bad_keys_pkey`, DSQL_REASONS.keyType('jsonb')),
					reject('create_table', `${s}.bad_keys.bad_keys_b_key`, DSQL_REASONS.keyType('bytea')),
					reject('create_table', `${s}.bad_keys.bad_keys_js_key`, DSQL_REASONS.keyType('json')),
					reject('create_table', `${s}.bad_keys.bad_keys_iv_key`, DSQL_REASONS.keyType('interval')),
					reject('create_table', `${s}.bad_keys.bad_keys_tz_key`, DSQL_REASONS.keyType('time with time zone')),
				],
				canary: {
					setup: [],
					ok: `CREATE TABLE ${q('canary_key')} ("j" text PRIMARY KEY)`,
					rejected: `CREATE TABLE ${q('canary_key2')} ("j" jsonb PRIMARY KEY)`,
					sqlstate: '0A000',
					message: 'datatype jsonb is not supported in a key',
				},
			},
			{
				name: 'reject row-level security on a new table',
				from: { schema },
				to: {
					schema,
					t: schema.table.withRLS('rls_t', { id: uuid().primaryKey() }),
				},
				issues: [reject('create_table', `${s}.rls_t`, DSQL_REASONS.rls)],
				canary: {
					setup: [`CREATE TABLE ${q('canary_rls')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('canary_rls')} RENAME COLUMN "id" TO "id2"`,
					rejected: `ALTER TABLE ${q('canary_rls')} ENABLE ROW LEVEL SECURITY`,
					sqlstate: '0A000',
					message: 'unsupported ALTER TABLE ENABLE ROW SECURITY statement',
				},
			},
		],
		drop_table: [
			{
				name: 'drop a table',
				from: { schema, base: base() },
				to: { schema },
			},
			{
				name: 'reject dropping a table with policies',
				direct: [{
					type: 'drop_table',
					key: `${s}.with_policy`,
					table: {
						schema: s,
						name: 'with_policy',
						columns: [],
						indexes: [],
						pk: null,
						fks: [],
						uniques: [],
						checks: [],
						policies: [{
							entityType: 'policies',
							schema: s,
							table: 'with_policy',
							name: 'p',
							as: 'PERMISSIVE',
							for: 'ALL',
							roles: ['public'],
							using: null,
							withCheck: null,
						}],
						isRlsEnabled: true,
					},
				}],
				issues: [reject('drop_table', `${s}.with_policy`, DSQL_REASONS.policy)],
			},
		],
		rename_table: [{
			name: 'rename a table',
			from: { schema, t: schema.table('old_name', { id: uuid().primaryKey() }) },
			to: { schema, t: schema.table('new_name', { id: uuid().primaryKey() }) },
			renames: [`${s}.old_name->${s}.new_name`],
		}],
		move_table: [{
			name: 'move a table to another schema',
			from: { schema, schema2, t: schema.table('moved', { id: uuid().primaryKey() }) },
			to: { schema, schema2, t: schema2.table('moved', { id: uuid().primaryKey() }) },
			renames: [`${s}.moved->${s2}.moved`],
		}],
		rename_column: [{
			name: 'rename a column',
			from: { schema, t: schema.table('rc', { id: uuid().primaryKey(), a: integer() }) },
			to: { schema, t: schema.table('rc', { id: uuid().primaryKey(), b: integer() }) },
			renames: [`${s}.rc.a->${s}.rc.b`],
		}],
		add_column: [
			{
				name: 'add a nullable column',
				from: { schema, base: base() },
				to: {
					schema,
					base: schema.table('base', {
						id: uuid().primaryKey(),
						a: integer(),
						b: bigint({ mode: 'number' }).notNull(),
						c: text(),
						j: jsonb(),
						added: numeric({ precision: 12, scale: 4 }),
					}),
				},
			},
			{
				name: 'reject adding a column with constraints',
				canaries: [
					{
						setup: [`CREATE TABLE ${q('cn_addc')} ("id" uuid PRIMARY KEY)`],
						ok: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "a" integer`,
						rejected: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "nn" integer NOT NULL`,
						sqlstate: '0A000',
						message: 'ALTER TABLE ADD COLUMN with constraint not supported',
					},
					{
						setup: [`CREATE TABLE ${q('cn_addc')} ("id" uuid PRIMARY KEY)`],
						ok: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "a" integer`,
						rejected: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "gen" integer GENERATED ALWAYS AS (1) STORED`,
						sqlstate: '0A000',
						message: 'ALTER TABLE ADD COLUMN with constraint not supported',
					},
					{
						setup: [`CREATE TABLE ${q('cn_addc')} ("id" uuid PRIMARY KEY)`],
						ok: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "a" integer`,
						rejected: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "ident" bigint GENERATED ALWAYS AS IDENTITY (CACHE 1)`,
						sqlstate: '0A000',
						message: 'ALTER TABLE ADD COLUMN with constraint not supported',
					},
					{
						setup: [`CREATE TABLE ${q('cn_addc')} ("id" uuid PRIMARY KEY)`],
						ok: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "a" integer`,
						rejected: `ALTER TABLE ${q('cn_addc')} ADD COLUMN "pk" integer PRIMARY KEY`,
						sqlstate: '0A000',
						message: 'ALTER TABLE ADD COLUMN with constraint not supported',
					},
				],
				from: { schema, base: base() },
				to: {
					schema,
					base: schema.table('base', {
						id: uuid().primaryKey(),
						a: integer(),
						b: bigint({ mode: 'number' }).notNull(),
						c: text(),
						j: jsonb(),
						withDefault: integer('with_default').default(1),
						withNotNull: integer('with_not_null').notNull(),
						withGenerated: integer('with_generated').generatedAlwaysAs(sql`1`),
						withIdentity: bigint('with_identity', { mode: 'number' }).generatedAlwaysAsIdentity(),
					}),
				},
				issues: [
					reject('add_column', `${s}.base.with_default`, DSQL_REASONS.addColumn),
					reject('add_column', `${s}.base.with_not_null`, DSQL_REASONS.addColumn),
					reject('add_column', `${s}.base.with_generated`, DSQL_REASONS.addColumn),
					reject('add_column', `${s}.base.with_identity`, DSQL_REASONS.addColumn),
				],
				canary: {
					setup: [`CREATE TABLE ${q('canary_add')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('canary_add')} ADD COLUMN "a" integer`,
					rejected: `ALTER TABLE ${q('canary_add')} ADD COLUMN "b" integer DEFAULT 1`,
					sqlstate: '0A000',
					message: 'ALTER TABLE ADD COLUMN with constraint not supported',
				},
			},
			{
				name: 'reject adding a column of a type DSQL lacks',
				from: { schema, t: schema.table('addtype', { id: uuid().primaryKey() }) },
				to: { schema, t: schema.table('addtype', { id: uuid().primaryKey(), ip: inet() }) },
				issues: [reject('add_column', `${s}.addtype.ip`, DSQL_REASONS.type('inet'))],
			},
			{
				name: 'reject adding a primary key column',
				from: { schema, t: schema.table('nopk', { a: integer() }) },
				to: { schema, t: schema.table('nopk', { a: integer(), id: uuid().primaryKey() }) },
				issues: [
					reject('add_column', `${s}.nopk.id`, DSQL_REASONS.addColumn),
					reject('add_pk', `${s}.nopk.nopk_pkey`, DSQL_REASONS.primaryKey),
				],
			},
		],
		drop_column: [{
			name: 'drop a column',
			from: { schema, base: base() },
			to: {
				schema,
				base: schema.table('base', {
					id: uuid().primaryKey(),
					a: integer(),
					b: bigint({ mode: 'number' }).notNull(),
					c: text(),
				}),
			},
		}],
		alter_column: [
			{
				name: 'change defaults, drop NOT NULL and drop a generated expression',
				from: {
					schema,
					t: schema.table('alter_ok', {
						id: uuid().primaryKey(),
						a: integer().default(1),
						b: integer(),
						c: integer().notNull(),
						g: integer().generatedAlwaysAs(sql`1 + 1`),
					}),
				},
				to: {
					schema,
					t: schema.table('alter_ok', {
						id: uuid().primaryKey(),
						a: integer(),
						b: integer().default(2),
						c: integer(),
						g: integer(),
					}),
				},
			},
			{
				name: 'add an identity to a NOT NULL bigint column and change identities',
				from: {
					schema,
					t: schema.table('ident_alter', {
						id: uuid().primaryKey(),
						a: bigint({ mode: 'number' }).notNull(),
						b: bigint({ mode: 'number' }).generatedByDefaultAsIdentity({ cache: 1 }),
						c: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ cache: 1 }),
					}),
				},
				to: {
					schema,
					t: schema.table('ident_alter', {
						id: uuid().primaryKey(),
						a: bigint({ mode: 'number' }).notNull().generatedByDefaultAsIdentity({ cache: 65536 }),
						b: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ cache: 65536, increment: 2 }),
						c: bigint({ mode: 'number' }).notNull(),
					}),
				},
			},
			{
				name: 'reject a type change, SET NOT NULL and identity on a nullable column',
				canaries: [
					{
						setup: [`CREATE TABLE ${q('cn_alt')} ("id" uuid PRIMARY KEY, "a" integer, "b" bigint)`],
						ok: `ALTER TABLE ${q('cn_alt')} ALTER COLUMN "a" DROP DEFAULT`,
						rejected: `ALTER TABLE ${q('cn_alt')} ALTER COLUMN "a" SET DATA TYPE bigint`,
						sqlstate: '0A000',
						message: 'unsupported ALTER TABLE ALTER COLUMN ... SET DATA TYPE statement',
					},
					{
						setup: [`CREATE TABLE ${q('cn_altid')} ("id" uuid PRIMARY KEY, "b" bigint)`],
						ok: `ALTER TABLE ${q('cn_altid')} ALTER COLUMN "b" DROP DEFAULT`,
						rejected: `ALTER TABLE ${q('cn_altid')} ALTER COLUMN "b" ADD GENERATED ALWAYS AS IDENTITY (CACHE 1)`,
						sqlstate: '55000',
						message: 'must be declared NOT NULL before identity can be added',
					},
				],
				from: {
					schema,
					t: schema.table('alter_bad', {
						id: uuid().primaryKey(),
						a: integer(),
						b: integer(),
						c: bigint({ mode: 'number' }),
					}),
				},
				to: {
					schema,
					t: schema.table('alter_bad', {
						id: uuid().primaryKey(),
						a: bigint({ mode: 'number' }),
						b: integer().notNull(),
						c: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
					}),
				},
				issues: [
					reject('alter_column', `${s}.alter_bad.a`, DSQL_REASONS.alterType),
					reject('alter_column', `${s}.alter_bad.b`, DSQL_REASONS.setNotNull),
					reject('alter_column', `${s}.alter_bad.c`, DSQL_REASONS.identityNullable),
				],
				canary: {
					setup: [`CREATE TABLE ${q('canary_alter')} ("id" uuid PRIMARY KEY, "a" integer)`],
					ok: `ALTER TABLE ${q('canary_alter')} ALTER COLUMN "a" SET DEFAULT 1`,
					rejected: `ALTER TABLE ${q('canary_alter')} ALTER COLUMN "a" SET NOT NULL`,
					sqlstate: '0A000',
					message: 'unsupported ALTER TABLE ALTER COLUMN ... SET NOT NULL statement',
				},
			},
			{
				name: 'reject turning a column into an array',
				from: { schema, t: schema.table('to_array', { id: uuid().primaryKey(), a: integer() }) },
				to: { schema, t: schema.table('to_array', { id: uuid().primaryKey(), a: integer().array() }) },
				issues: [reject('alter_column', `${s}.to_array.a`, DSQL_REASONS.alterType)],
			},
			{
				name: 'reject turning a column into an enum',
				offline: true,
				from: {
					schema,
					e: schema.enum('mood', ['happy']),
					t: schema.table('to_enum', { id: uuid().primaryKey(), m: text() }),
				},
				to: {
					schema,
					e: schema.enum('mood', ['happy']),
					t: schema.table('to_enum', { id: uuid().primaryKey(), m: schema.enum('mood', ['happy'])() }),
				},
				issues: [reject('alter_column', `${s}.to_enum.m`, DSQL_REASONS.alterType)],
			},
			{
				name: 'reject moving a column to an enum of the same name in another schema',
				offline: true,
				from: {
					schema,
					schema2,
					e1: schema.enum('mood', ['happy']),
					e2: schema2.enum('mood', ['happy']),
					t: schema.table('enum_move', { id: uuid().primaryKey(), m: schema.enum('mood', ['happy'])() }),
				},
				to: {
					schema,
					schema2,
					e1: schema.enum('mood', ['happy']),
					e2: schema2.enum('mood', ['happy']),
					t: schema.table('enum_move', { id: uuid().primaryKey(), m: schema2.enum('mood', ['happy'])() }),
				},
				issues: [reject('alter_column', `${s}.enum_move.m`, DSQL_REASONS.alterType)],
			},
			{
				name: 'reject an identity CACHE DSQL refuses in an alter',
				from: {
					schema,
					t: schema.table('alter_cache', {
						id: uuid().primaryKey(),
						a: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ cache: 1 }),
					}),
				},
				to: {
					schema,
					t: schema.table('alter_cache', {
						id: uuid().primaryKey(),
						a: bigint({ mode: 'number' }).generatedAlwaysAsIdentity({ cache: 100 }),
					}),
				},
				issues: [reject('alter_column', `${s}.alter_cache.a`, DSQL_REASONS.cache)],
			},
		],
		recreate_column: [{
			name: 'reject a changed generated expression',
			pushIgnores: true,
			from: {
				schema,
				t: schema.table('regen', { id: uuid().primaryKey(), g: integer().generatedAlwaysAs(sql`1`) }),
			},
			to: {
				schema,
				t: schema.table('regen', { id: uuid().primaryKey(), g: integer().generatedAlwaysAs(sql`2`) }),
			},
			issues: [reject('recreate_column', `${s}.regen.g`, DSQL_REASONS.addColumn)],
			canary: {
				setup: [`CREATE TABLE ${q('canary_regen')} ("id" uuid PRIMARY KEY, "a" integer)`],
				ok: `ALTER TABLE ${q('canary_regen')} ADD COLUMN "b" integer`,
				rejected: `ALTER TABLE ${q('canary_regen')} ADD COLUMN "g" integer GENERATED ALWAYS AS ("a" * 2) STORED`,
				sqlstate: '0A000',
				message: 'ALTER TABLE ADD COLUMN with constraint not supported',
			},
		}],
		create_index: [
			{
				name: 'create btree indexes',
				from: { schema, base: base() },
				to: {
					schema,
					base: schema.table('base', {
						id: uuid().primaryKey(),
						a: integer(),
						b: bigint({ mode: 'number' }).notNull(),
						c: text(),
						j: jsonb(),
					}, (t) => [
						index('base_a_idx').on(t.a),
						uniqueIndex('base_b_c_idx').on(t.b, t.c.nullsFirst()),
						index('base_lower_c_idx').on(sql`lower(${t.c})`),
						index('base_partial_idx').on(t.a).where(sql`${t.a} > 10`),
					]),
				},
				sql: [
					`CREATE INDEX ASYNC "base_a_idx" ON ${q('base')} ("a");`,
					`CREATE UNIQUE INDEX ASYNC "base_b_c_idx" ON ${q('base')} ("b","c" NULLS FIRST);`,
					`CREATE INDEX ASYNC "base_lower_c_idx" ON ${q('base')} (lower("c"));`,
					`CREATE INDEX ASYNC "base_partial_idx" ON ${q('base')} ("a") WHERE "a" > 10;`,
				],
			},
			{
				name: 'create an index with a new table',
				from: { schema },
				to: {
					schema,
					t: schema.table('with_index', { id: uuid().primaryKey(), a: integer() }, (t) => [
						index('with_index_a_idx').on(t.a),
					]),
				},
				sql: [
					`CREATE TABLE ${q('with_index')} (\n\t"id" uuid PRIMARY KEY,\n\t"a" integer\n);\n`,
					`CREATE INDEX ASYNC "with_index_a_idx" ON ${q('with_index')} ("a");`,
				],
			},
			{
				name: 'create an index whose operator class is the default one',
				direct: [{
					type: 'create_index',
					index: {
						entityType: 'indexes',
						schema: s,
						table: 'opc',
						name: 'opc_a_idx',
						nameExplicit: true,
						columns: [{
							value: 'a',
							isExpression: false,
							asc: true,
							nullsFirst: false,
							opclass: { name: 'int4_ops', default: true },
						}],
						isUnique: false,
						where: null,
						with: '',
						method: 'btree',
						concurrently: false,
					},
				}] as JsonStatement[],
				sql: [`CREATE INDEX ASYNC "opc_a_idx" ON ${q('opc')} ("a");`],
				live: {
					setup: [`CREATE TABLE ${q('opc')} ("id" uuid PRIMARY KEY, "a" integer)`],
					check:
						`SELECT c.relname AS "row" FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE i.indisvalid AND c.relname = 'opc_a_idx'`,
					includes: ['opc_a_idx'],
				},
			},
			{
				name: 'reject index options DSQL refuses',
				canaries: [
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_op" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX ASYNC "cn_idx_op" ON ${q('cn_idx')} ("c" text_pattern_ops)`,
						sqlstate: '0A000',
						message: 'opclass not supported for index keys',
					},
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_hash" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX ASYNC "cn_idx_hash" ON ${q('cn_idx')} USING hash ("a")`,
						sqlstate: '0A000',
						message: 'USING not supported for CREATE INDEX',
					},
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_conc" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX CONCURRENTLY "cn_idx_conc" ON ${q('cn_idx')} ("a")`,
						sqlstate: '0A000',
						message: 'CONCURRENTLY not supported for CREATE INDEX',
					},
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_with" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX ASYNC "cn_idx_with" ON ${q('cn_idx')} ("a") WITH (fillfactor=70)`,
						sqlstate: '0A000',
						message: 'WITH not supported for CREATE INDEX',
					},
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_j" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX ASYNC "cn_idx_j" ON ${q('cn_idx')} ("j")`,
						sqlstate: '0A000',
						message: 'datatype jsonb is not supported in a key',
					},
					{
						setup: [`CREATE TABLE ${q('cn_idx')} ("id" uuid PRIMARY KEY, "a" integer, "c" text, "j" jsonb)`],
						ok: `CREATE INDEX ASYNC "cn_idx_ok_plain" ON ${q('cn_idx')} ("a")`,
						rejected: `CREATE INDEX "cn_idx_plain" ON ${q('cn_idx')} ("a")`,
						sqlstate: '0A000',
						message: 'unsupported mode. please use CREATE INDEX ASYNC.',
					},
				],
				from: { schema, base: base() },
				to: {
					schema,
					base: schema.table('base', {
						id: uuid().primaryKey(),
						a: integer(),
						b: bigint({ mode: 'number' }).notNull(),
						c: text(),
						j: jsonb(),
					}, (t) => [
						index('base_desc_idx').on(t.a.desc()),
						index('base_op_idx').on(t.c.op('text_pattern_ops')),
						index('base_hash_idx').using('hash', t.a),
						index('base_conc_idx').on(t.b).concurrently(),
						index('base_with_idx').on(t.c).with({ fillfactor: 70 }),
						index('base_j_idx').on(t.j),
					]),
				},
				issues: [
					reject('create_index', `${s}.base.base_desc_idx`, DSQL_REASONS.indexDesc),
					reject('create_index', `${s}.base.base_op_idx`, DSQL_REASONS.indexOpclass),
					reject('create_index', `${s}.base.base_hash_idx`, DSQL_REASONS.indexMethod),
					reject('create_index', `${s}.base.base_conc_idx`, DSQL_REASONS.indexConcurrently),
					reject('create_index', `${s}.base.base_with_idx`, DSQL_REASONS.indexWith),
					reject('create_index', `${s}.base.base_j_idx`, DSQL_REASONS.keyType('jsonb')),
				],
				canary: {
					setup: [`CREATE TABLE ${q('canary_idx')} ("id" uuid PRIMARY KEY, "a" integer)`],
					ok: `CREATE INDEX ASYNC "canary_idx_a" ON ${q('canary_idx')} ("a")`,
					rejected: `CREATE INDEX ASYNC "canary_idx_d" ON ${q('canary_idx')} ("a" DESC)`,
					sqlstate: '0A000',
					message: 'specifying sort order not supported for index keys',
				},
			},
		],
		recreate_index: [
			{
				name: 'recreate an index',
				from: {
					schema,
					t: schema.table('reidx', { id: uuid().primaryKey(), a: integer(), b: integer() }, (t) => [
						index('reidx_idx').on(t.a),
					]),
				},
				to: {
					schema,
					t: schema.table('reidx', { id: uuid().primaryKey(), a: integer(), b: integer() }, (t) => [
						index('reidx_idx').on(t.a).where(sql`${t.b} > 0`),
					]),
				},
				sql: [
					`DROP INDEX IF EXISTS "${s}"."reidx_idx";`,
					`CREATE INDEX ASYNC "reidx_idx" ON ${q('reidx')} ("a") WHERE "b" > 0;`,
				],
			},
			{
				name: 'reject a recreated index with options DSQL refuses',
				pushIgnores: true,
				from: {
					schema,
					t: schema.table(
						'reidx_bad',
						{ id: uuid().primaryKey(), a: integer() },
						(t) => [index('reidx_bad_idx').on(t.a)],
					),
				},
				to: {
					schema,
					t: schema.table('reidx_bad', { id: uuid().primaryKey(), a: integer() }, (t) => [
						index('reidx_bad_idx').on(t.a.desc()),
					]),
				},
				issues: [reject('recreate_index', `${s}.reidx_bad.reidx_bad_idx`, DSQL_REASONS.indexDesc)],
			},
		],
		drop_index: [{
			name: 'drop an index',
			from: {
				schema,
				t: schema.table('dropidx', { id: uuid().primaryKey(), a: integer() }, (t) => [index('dropidx_a').on(t.a)]),
			},
			to: { schema, t: schema.table('dropidx', { id: uuid().primaryKey(), a: integer() }) },
		}],
		rename_index: [{
			name: 'rename an index',
			from: {
				schema,
				t: schema.table('renidx', { id: uuid().primaryKey(), a: integer() }, (t) => [index('renidx_a').on(t.a)]),
			},
			to: {
				schema,
				t: schema.table('renidx', { id: uuid().primaryKey(), a: integer() }, (t) => [index('renidx_a2').on(t.a)]),
			},
			renames: [`${s}.renidx.renidx_a->${s}.renidx.renidx_a2`],
		}],
		add_pk: [{
			name: 'reject adding a primary key',
			from: { schema, t: schema.table('addpk', { a: integer().notNull() }) },
			to: { schema, t: schema.table('addpk', { a: integer().notNull() }, (t) => [primaryKey({ columns: [t.a] })]) },
			issues: [reject('add_pk', `${s}.addpk.addpk_pkey`, DSQL_REASONS.primaryKey)],
			canary: {
				setup: [`CREATE TABLE ${q('canary_pk')} ("a" integer NOT NULL)`],
				ok: `ALTER TABLE ${q('canary_pk')} ADD COLUMN "b" integer`,
				rejected: `ALTER TABLE ${q('canary_pk')} ADD CONSTRAINT "canary_pk_pkey" PRIMARY KEY("a")`,
				sqlstate: '0A000',
				message: 'unsupported ALTER TABLE ADD CONSTRAINT statement',
			},
		}],
		drop_pk: [{
			name: 'reject dropping a primary key',
			from: {
				schema,
				t: schema.table('droppk', { a: integer().notNull() }, (t) => [primaryKey({ columns: [t.a] })]),
			},
			to: { schema, t: schema.table('droppk', { a: integer().notNull() }) },
			issues: [reject('drop_pk', `${s}.droppk.droppk_pkey`, DSQL_REASONS.primaryKey)],
			canary: {
				setup: [`CREATE TABLE ${q('canary_dpk')} ("a" integer PRIMARY KEY, "b" integer)`],
				ok: `ALTER TABLE ${q('canary_dpk')} DROP COLUMN "b"`,
				rejected: `ALTER TABLE ${q('canary_dpk')} DROP CONSTRAINT "canary_dpk_pkey"`,
				sqlstate: '0A000',
				message: 'unsupported ALTER TABLE DROP CONSTRAINT statement',
			},
		}],
		alter_pk: [{
			name: 'reject changing a primary key',
			from: {
				schema,
				t: schema.table('alterpk', { a: integer().notNull(), b: integer().notNull() }, (t) => [
					primaryKey({ columns: [t.a] }),
				]),
			},
			to: {
				schema,
				t: schema.table('alterpk', { a: integer().notNull(), b: integer().notNull() }, (t) => [
					primaryKey({ columns: [t.a, t.b] }),
				]),
			},
			issues: [reject('alter_pk', `${s}.alterpk.alterpk_pkey`, DSQL_REASONS.primaryKey)],
		}],
		rename_constraint: [{
			name: 'rename a check constraint',
			from: {
				schema,
				t: schema.table('renchk', { id: uuid().primaryKey(), a: integer() }, (t) => [
					check('renchk_a_check', sql`${t.a} > 0`),
				]),
			},
			to: {
				schema,
				t: schema.table('renchk', { id: uuid().primaryKey(), a: integer() }, (t) => [
					check('renchk_a_check2', sql`${t.a} > 0`),
				]),
			},
			renames: [`${s}.renchk.renchk_a_check->${s}.renchk.renchk_a_check2`],
		}],
		create_fk: [
			{
				name: 'create a foreign key with new tables',
				from: { schema },
				to: { schema, parent: parent(), child: child() },
				sql: [
					`CREATE TABLE ${q('parent')} (\n\t"id" uuid PRIMARY KEY\n);\n`,
					`CREATE TABLE ${q('child')} (\n\t"id" uuid PRIMARY KEY,\n\t"parent_id" uuid\n);\n`,
					`ALTER TABLE ${q('child')} ADD CONSTRAINT "child_parent_fk" FOREIGN KEY ("parent_id") REFERENCES ${
						q('parent')
					}("id") NOT VALID;`,
					validate('child', 'child_parent_fk'),
				],
			},
			{
				name: 'add a foreign key to existing tables',
				from: {
					schema,
					parent: parent(),
					child: schema.table('child', { id: uuid().primaryKey(), parentId: uuid('parent_id') }),
				},
				to: { schema, parent: parent(), child: child('cascade') },
				sql: [
					`ALTER TABLE ${q('child')} ADD CONSTRAINT "child_parent_fk" FOREIGN KEY ("parent_id") REFERENCES ${
						q('parent')
					}("id") ON DELETE CASCADE NOT VALID;`,
					validate('child', 'child_parent_fk'),
				],
				canary: {
					setup: [
						`CREATE TABLE ${q('canary_fkp')} ("id" uuid PRIMARY KEY)`,
						`CREATE TABLE ${q('canary_fkc')} ("id" uuid PRIMARY KEY, "p" uuid)`,
					],
					ok: `ALTER TABLE ${q('canary_fkc')} ADD CONSTRAINT "canary_fk_ok" FOREIGN KEY ("p") REFERENCES ${
						q('canary_fkp')
					}("id") NOT VALID`,
					rejected: `ALTER TABLE ${q('canary_fkc')} ADD CONSTRAINT "canary_fk" FOREIGN KEY ("p") REFERENCES ${
						q('canary_fkp')
					}("id")`,
					sqlstate: '0A000',
					message: 'unsupported ALTER TABLE ADD CONSTRAINT statement',
				},
			},
			{
				name: 'create a self-referencing composite foreign key',
				from: { schema },
				to: {
					schema,
					t: schema.table('tree', {
						a: integer().notNull(),
						b: integer().notNull(),
						pa: integer(),
						pb: integer(),
					}, (t) => [
						primaryKey({ columns: [t.a, t.b] }),
						foreignKey({ name: 'tree_parent_fk', columns: [t.pa, t.pb], foreignColumns: [t.a, t.b] }),
					]),
				},
				sql: [
					`CREATE TABLE ${
						q('tree')
					} (\n\t"a" integer,\n\t"b" integer,\n\t"pa" integer,\n\t"pb" integer,\n\tCONSTRAINT "tree_pkey" PRIMARY KEY("a","b")\n);\n`,
					`ALTER TABLE ${q('tree')} ADD CONSTRAINT "tree_parent_fk" FOREIGN KEY ("pa","pb") REFERENCES ${
						q('tree')
					}("a","b") NOT VALID;`,
					validate('tree', 'tree_parent_fk'),
				],
			},
		],
		recreate_fk: [{
			name: 'recreate a foreign key with new actions',
			from: { schema, parent: parent(), child: child() },
			to: { schema, parent: parent(), child: child('cascade') },
			sql: [
				`ALTER TABLE ${
					q('child')
				} DROP CONSTRAINT IF EXISTS "child_parent_fk", ADD CONSTRAINT "child_parent_fk" FOREIGN KEY ("parent_id") REFERENCES ${
					q('parent')
				}("id") ON DELETE CASCADE NOT VALID;`,
				validate('child', 'child_parent_fk'),
			],
		}],
		drop_fk: [{
			name: 'drop a foreign key',
			from: { schema, parent: parent(), child: child() },
			to: {
				schema,
				parent: parent(),
				child: schema.table('child', { id: uuid().primaryKey(), parentId: uuid('parent_id') }),
			},
		}],
		add_unique: [{
			name: 'reject adding a unique constraint',
			from: { schema, t: schema.table('adduq', { id: uuid().primaryKey(), a: integer() }) },
			to: { schema, t: schema.table('adduq', { id: uuid().primaryKey(), a: integer().unique() }) },
			issues: [reject('add_unique', `${s}.adduq.adduq_a_key`, DSQL_REASONS.unique)],
			canary: {
				setup: [`CREATE TABLE ${q('canary_uq')} ("id" uuid PRIMARY KEY, "a" integer)`],
				ok: `CREATE UNIQUE INDEX ASYNC "canary_uq_a" ON ${q('canary_uq')} ("a")`,
				rejected: `ALTER TABLE ${q('canary_uq')} ADD CONSTRAINT "canary_uq_a_key" UNIQUE("a")`,
				sqlstate: '0A000',
				message: 'unsupported ALTER TABLE ADD CONSTRAINT statement',
			},
		}],
		drop_unique: [{
			name: 'drop a unique constraint',
			from: { schema, t: schema.table('dropuq', { id: uuid().primaryKey(), a: integer().unique() }) },
			to: { schema, t: schema.table('dropuq', { id: uuid().primaryKey(), a: integer() }) },
		}],
		alter_unique: [{
			name: 'reject changing a unique constraint',
			from: {
				schema,
				t: schema.table('alteruq', { id: uuid().primaryKey(), a: integer() }, (t) => [unique('alteruq_u').on(t.a)]),
			},
			to: {
				schema,
				t: schema.table('alteruq', { id: uuid().primaryKey(), a: integer() }, (t) => [
					unique('alteruq_u').on(t.a).nullsNotDistinct(),
				]),
			},
			issues: [reject('alter_unique', `${s}.alteruq.alteruq_u`, DSQL_REASONS.unique)],
		}],
		add_check: [{
			name: 'add a check to an existing table',
			from: { schema, base: base() },
			to: {
				schema,
				base: schema.table('base', {
					id: uuid().primaryKey(),
					a: integer(),
					b: bigint({ mode: 'number' }).notNull(),
					c: text(),
					j: jsonb(),
				}, (t) => [check('base_a_check', sql`${t.a} > 0`)]),
			},
			sql: [
				`ALTER TABLE ${q('base')} ADD CONSTRAINT "base_a_check" CHECK ("a" > 0) NOT VALID;`,
				validate('base', 'base_a_check'),
			],
			canary: {
				setup: [`CREATE TABLE ${q('canary_chk')} ("id" uuid PRIMARY KEY, "a" integer)`],
				ok: `ALTER TABLE ${q('canary_chk')} ADD CONSTRAINT "canary_chk_ok" CHECK ("a" > 0) NOT VALID`,
				rejected: `ALTER TABLE ${q('canary_chk')} ADD CONSTRAINT "canary_chk_a" CHECK ("a" > 0)`,
				sqlstate: '0A000',
				message: 'unsupported ALTER TABLE ADD CONSTRAINT statement',
			},
		}],
		alter_check: [{
			name: 'change a check value',
			from: {
				schema,
				t: schema.table('altchk', { id: uuid().primaryKey(), a: integer() }, (t) => [
					check('altchk_a_check', sql`${t.a} > 0`),
				]),
			},
			to: {
				schema,
				t: schema.table('altchk', { id: uuid().primaryKey(), a: integer() }, (t) => [
					check('altchk_a_check', sql`${t.a} > 1`),
				]),
			},
			sql: [
				`ALTER TABLE ${
					q('altchk')
				} DROP CONSTRAINT IF EXISTS "altchk_a_check", ADD CONSTRAINT "altchk_a_check" CHECK ("a" > 1) NOT VALID;`,
				validate('altchk', 'altchk_a_check'),
			],
		}],
		drop_check: [{
			name: 'drop a check',
			from: {
				schema,
				t: schema.table('dropchk', { id: uuid().primaryKey(), a: integer() }, (t) => [
					check('dropchk_a_check', sql`${t.a} > 0`),
				]),
			},
			to: { schema, t: schema.table('dropchk', { id: uuid().primaryKey(), a: integer() }) },
		}],
		create_schema: [{ name: 'create a schema', from: {}, to: { schema } }],
		drop_schema: [{ name: 'drop a schema', from: { schema, schema2 }, to: { schema } }],
		rename_schema: [{
			name: 'rename a schema',
			from: { schema, schema2 },
			to: { schema, renamed: pgSchema(`${s}_3`) },
			renames: [`${s2}->${s}_3`],
		}],
		create_sequence: [
			{
				name: 'create sequences',
				from: { schema },
				to: {
					schema,
					seq1: schema.sequence('seq1'),
					seq2: schema.sequence('seq2', { cache: 65536, increment: 2, startWith: 10, cycle: true }),
				},
			},
			{
				name: 'reject a sequence CACHE DSQL refuses',
				from: { schema },
				to: {
					schema,
					seq100: schema.sequence('seq100', { cache: 100 }),
					seq0: schema.sequence('seq0', { cache: 0 }),
					seqNeg: schema.sequence('seq_neg', { cache: -1 }),
					seqUnsafe: schema.sequence('seq_unsafe', { cache: Number.MAX_SAFE_INTEGER + 2 }),
				},
				issues: [
					reject('create_sequence', `${s}.seq100`, DSQL_REASONS.cache),
					reject('create_sequence', `${s}.seq0`, DSQL_REASONS.cache),
					reject('create_sequence', `${s}.seq_neg`, DSQL_REASONS.cache),
					reject('create_sequence', `${s}.seq_unsafe`, DSQL_REASONS.cacheUnsafe),
				],
				canary: {
					setup: [],
					ok: `CREATE SEQUENCE ${q('canary_seq')} CACHE 65536`,
					rejected: `CREATE SEQUENCE ${q('canary_seq2')} CACHE 65535`,
					sqlstate: '22023',
					message: 'CACHE (65535) must be greater than or equal to 65536 or equal to 1',
				},
			},
		],
		alter_sequence: [
			{
				name: 'alter a sequence',
				from: { schema, seq: schema.sequence('alt_seq', { cache: 1 }) },
				to: { schema, seq: schema.sequence('alt_seq', { cache: 65536, increment: 3 }) },
			},
			{
				name: 'reject an altered sequence CACHE DSQL refuses',
				from: { schema, seq: schema.sequence('alt_seq_bad', { cache: 1 }) },
				to: { schema, seq: schema.sequence('alt_seq_bad', { cache: 2 }) },
				issues: [reject('alter_sequence', `${s}.alt_seq_bad`, DSQL_REASONS.cache)],
			},
		],
		rename_sequence: [{
			name: 'rename a sequence',
			from: { schema, seq: schema.sequence('ren_seq') },
			to: { schema, seq: schema.sequence('ren_seq2') },
			renames: [`${s}.ren_seq->${s}.ren_seq2`],
		}],
		move_sequence: [{
			name: 'move a sequence',
			from: { schema, schema2, seq: schema.sequence('mv_seq') },
			to: { schema, schema2, seq: schema2.sequence('mv_seq') },
			renames: [`${s}.mv_seq->${s2}.mv_seq`],
		}],
		drop_sequence: [{
			name: 'drop a sequence',
			from: { schema, seq: schema.sequence('drop_seq') },
			to: { schema },
		}],
		create_enum: [{
			name: 'reject enums',
			from: { schema },
			to: { schema, e: schema.enum('mood', ['happy', 'sad']) },
			issues: [reject('create_enum', `${s}.mood`, DSQL_REASONS.enum)],
			canary: {
				setup: [],
				ok: `CREATE TABLE ${q('canary_enum')} ("mood" text CHECK ("mood" IN ('happy', 'sad')))`,
				rejected: `CREATE TYPE ${q('canary_mood')} AS ENUM('happy', 'sad')`,
				sqlstate: '0A000',
				message: 'CREATE TYPE not supported',
			},
		}],
		drop_enum: [{
			name: 'reject dropping an enum',
			canaries: [
				{
					setup: [],
					ok: `CREATE TABLE ${q('cn_enum_ok')} ("id" uuid PRIMARY KEY)`,
					rejected: `DROP TYPE ${q('cn_mood')}`,
					sqlstate: '0A000',
					message: 'unsupported object in DROP statement',
				},
			],
			from: { schema, e: schema.enum('mood', ['happy']) },
			to: { schema },
			issues: [reject('drop_enum', `${s}.mood`, DSQL_REASONS.enum)],
		}],
		rename_enum: [{
			name: 'reject renaming an enum',
			canaries: [
				{
					setup: [],
					ok: `CREATE TABLE ${q('cn_renum_ok')} ("id" uuid PRIMARY KEY)`,
					rejected: `ALTER TYPE ${q('cn_mood')} RENAME TO "cn_mood2"`,
					sqlstate: '0A000',
					message: 'unsupported object in RENAME statement',
				},
			],
			from: { schema, e: schema.enum('mood', ['happy']) },
			to: { schema, e: schema.enum('mood2', ['happy']) },
			renames: [`${s}.mood->${s}.mood2`],
			issues: [reject('rename_enum', `${s}.mood`, DSQL_REASONS.enum)],
		}],
		move_enum: [{
			name: 'reject moving an enum',
			canaries: [
				{
					setup: [],
					ok: `CREATE TABLE ${q('cn_menum_ok')} ("id" uuid PRIMARY KEY)`,
					rejected: `ALTER TYPE ${q('cn_mood')} SET SCHEMA "public"`,
					sqlstate: '0A000',
					message: 'unsupported object in ALTER OBJECT SCHEMA statement',
				},
			],
			from: { schema, schema2, e: schema.enum('mood', ['happy']) },
			to: { schema, schema2, e: schema2.enum('mood', ['happy']) },
			renames: [`${s}.mood->${s2}.mood`],
			issues: [reject('move_enum', `${s}.mood`, DSQL_REASONS.enum)],
		}],
		alter_enum: [{
			name: 'reject adding an enum value',
			canaries: [
				{
					setup: [],
					ok: `CREATE TABLE ${q('cn_enum2_ok')} ("id" uuid PRIMARY KEY)`,
					rejected: `ALTER TYPE ${q('cn_mood')} ADD VALUE 'b'`,
					sqlstate: '0A000',
					message: 'ALTER TYPE not supported',
				},
			],
			from: { schema, e: schema.enum('mood', ['happy']) },
			to: { schema, e: schema.enum('mood', ['happy', 'sad']) },
			issues: [reject('alter_enum', `${s}.mood`, DSQL_REASONS.enum)],
		}],
		recreate_enum: [{
			name: 'reject removing an enum value',
			from: { schema, e: schema.enum('mood', ['happy', 'sad']) },
			to: { schema, e: schema.enum('mood', ['happy']) },
			issues: [reject('recreate_enum', `${s}.mood`, DSQL_REASONS.enum)],
		}],
		create_policy: [{
			name: 'reject policies',
			from: { schema, t: schema.table('pol', { id: uuid().primaryKey() }) },
			to: { schema, t: schema.table('pol', { id: uuid().primaryKey() }, () => [pgPolicy('pol_p')]) },
			issues: [
				reject('alter_rls', `${s}.pol`, DSQL_REASONS.rls),
				reject('create_policy', `${s}.pol.pol_p`, DSQL_REASONS.policy),
			],
			canary: {
				setup: [`CREATE TABLE ${q('canary_pol')} ("id" uuid PRIMARY KEY)`],
				ok: `ALTER TABLE ${q('canary_pol')} ADD COLUMN "a" integer`,
				rejected: `CREATE POLICY "p" ON ${q('canary_pol')} AS PERMISSIVE FOR ALL TO public`,
				sqlstate: '0A000',
				message: 'unsupported statement: CreatePolicy',
			},
		}],
		drop_policy: [{
			name: 'reject dropping a policy',
			canaries: [
				{
					setup: [`CREATE TABLE ${q('cn_dpol')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('cn_dpol')} ADD COLUMN "a" integer`,
					rejected: `DROP POLICY "p" ON ${q('cn_dpol')}`,
					sqlstate: '0A000',
					message: 'unsupported object in DROP statement',
				},
			],
			from: { schema, t: schema.table('dpol', { id: uuid().primaryKey() }, () => [pgPolicy('dpol_p')]) },
			to: { schema, t: schema.table.withRLS('dpol', { id: uuid().primaryKey() }) },
			issues: [reject('drop_policy', `${s}.dpol.dpol_p`, DSQL_REASONS.policy)],
		}],
		rename_policy: [{
			name: 'reject renaming a policy',
			canaries: [
				{
					setup: [`CREATE TABLE ${q('cn_rpol')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('cn_rpol')} ADD COLUMN "a" integer`,
					rejected: `ALTER POLICY "p" ON ${q('cn_rpol')} RENAME TO "p2"`,
					sqlstate: '0A000',
					message: 'unsupported object in RENAME statement',
				},
			],
			from: { schema, t: schema.table('rpol', { id: uuid().primaryKey() }, () => [pgPolicy('rpol_p')]) },
			to: { schema, t: schema.table('rpol', { id: uuid().primaryKey() }, () => [pgPolicy('rpol_p2')]) },
			renames: [`${s}.rpol.rpol_p->${s}.rpol.rpol_p2`],
			issues: [reject('rename_policy', `${s}.rpol.rpol_p`, DSQL_REASONS.policy)],
		}],
		alter_policy: [{
			name: 'reject changing a policy',
			canaries: [
				{
					setup: [`CREATE TABLE ${q('cn_apol')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('cn_apol')} ADD COLUMN "a" integer`,
					rejected: `ALTER POLICY "p" ON ${q('cn_apol')} TO public`,
					sqlstate: '0A000',
					message: 'unsupported statement: AlterPolicy',
				},
			],
			from: {
				schema,
				t: schema.table('apol', { id: uuid().primaryKey() }, () => [pgPolicy('apol_p', { to: 'public' })]),
			},
			to: {
				schema,
				t: schema.table('apol', { id: uuid().primaryKey() }, () => [pgPolicy('apol_p', { to: 'current_role' })]),
			},
			issues: [reject('alter_policy', `${s}.apol.apol_p`, DSQL_REASONS.policy)],
		}],
		recreate_policy: [{
			name: 'reject recreating a policy',
			from: {
				schema,
				t: schema.table('rcpol', { id: uuid().primaryKey() }, () => [pgPolicy('rcpol_p', { for: 'select' })]),
			},
			to: {
				schema,
				t: schema.table('rcpol', { id: uuid().primaryKey() }, () => [pgPolicy('rcpol_p', { for: 'insert' })]),
			},
			issues: [reject('recreate_policy', `${s}.rcpol.rcpol_p`, DSQL_REASONS.policy)],
		}],
		alter_rls: [{
			name: 'reject disabling row-level security',
			canaries: [
				{
					setup: [`CREATE TABLE ${q('cn_drls')} ("id" uuid PRIMARY KEY)`],
					ok: `ALTER TABLE ${q('cn_drls')} ADD COLUMN "a" integer`,
					rejected: `ALTER TABLE ${q('cn_drls')} DISABLE ROW LEVEL SECURITY`,
					sqlstate: '0A000',
					message: 'unsupported ALTER TABLE DISABLE ROW SECURITY statement',
				},
			],
			from: { schema, t: schema.table.withRLS('drls', { id: uuid().primaryKey() }) },
			to: { schema, t: schema.table('drls', { id: uuid().primaryKey() }) },
			issues: [reject('alter_rls', `${s}.drls`, DSQL_REASONS.rls)],
		}],
		create_view: [
			{
				name: 'create views',
				from: { schema, base: base() },
				to: {
					schema,
					base: base(),
					v1: schema.view('v1').as((qb) => qb.select({ id: base().id }).from(base())),
					v2: schema.view('v2').with({ securityInvoker: true, checkOption: 'local' }).as((qb) =>
						qb.select({ id: base().id }).from(base())
					),
				},
			},
			{
				name: 'reject materialized views',
				from: { schema, base: base() },
				to: {
					schema,
					base: base(),
					mv: schema.materializedView('mv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				issues: [reject('create_view', `${s}.mv`, DSQL_REASONS.materializedView)],
				canary: {
					setup: [],
					ok: `CREATE VIEW ${q('canary_view')} AS (select 1 as x)`,
					rejected: `CREATE MATERIALIZED VIEW ${q('canary_mv')} AS (select 1 as x)`,
					sqlstate: '0A000',
					message: 'unsupported statement: CreateTableAs',
				},
			},
		],
		drop_view: [
			{
				name: 'drop a view',
				from: { schema, base: base(), v: schema.view('dv').as((qb) => qb.select({ id: base().id }).from(base())) },
				to: { schema, base: base() },
			},
			{
				name: 'reject dropping a materialized view',
				canaries: [
					{
						setup: [],
						ok: `CREATE VIEW ${q('cn_dmv_ok')} AS (select 1 as x)`,
						rejected: `DROP MATERIALIZED VIEW ${q('cn_dmv')}`,
						sqlstate: '0A000',
						message: 'unsupported object in DROP statement',
					},
				],
				from: {
					schema,
					base: base(),
					mv: schema.materializedView('dmv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				to: { schema, base: base() },
				issues: [reject('drop_view', `${s}.dmv`, DSQL_REASONS.materializedView)],
			},
		],
		rename_view: [
			{
				name: 'rename a view',
				from: { schema, base: base(), v: schema.view('rv').as((qb) => qb.select({ id: base().id }).from(base())) },
				to: { schema, base: base(), v: schema.view('rv2').as((qb) => qb.select({ id: base().id }).from(base())) },
				renames: [`${s}.rv->${s}.rv2`],
			},
			{
				name: 'reject renaming a materialized view',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_rmv_ok')} ("id" uuid PRIMARY KEY)`,
						rejected: `ALTER MATERIALIZED VIEW ${q('cn_rmv')} RENAME TO "cn_rmv2"`,
						sqlstate: '0A000',
						message: 'unsupported object in RENAME statement',
					},
				],
				from: {
					schema,
					base: base(),
					v: schema.materializedView('rmv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				to: {
					schema,
					base: base(),
					v: schema.materializedView('rmv2').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				renames: [`${s}.rmv->${s}.rmv2`],
				issues: [reject('rename_view', `${s}.rmv`, DSQL_REASONS.materializedView)],
			},
		],
		move_view: [
			{
				name: 'move a view',
				from: {
					schema,
					schema2,
					base: base(),
					v: schema.view('mvv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				to: {
					schema,
					schema2,
					base: base(),
					v: schema2.view('mvv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				renames: [`${s}.mvv->${s2}.mvv`],
			},
			{
				name: 'reject moving a materialized view',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_mmv_ok')} ("id" uuid PRIMARY KEY)`,
						rejected: `ALTER MATERIALIZED VIEW ${q('cn_mmv')} SET SCHEMA "public"`,
						sqlstate: '0A000',
						message: 'unsupported object in ALTER OBJECT SCHEMA statement',
					},
				],
				from: {
					schema,
					schema2,
					base: base(),
					v: schema.materializedView('mmv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				to: {
					schema,
					schema2,
					base: base(),
					v: schema2.materializedView('mmv').as((qb) => qb.select({ id: base().id }).from(base())),
				},
				renames: [`${s}.mmv->${s2}.mmv`],
				issues: [reject('move_view', `${s}.mmv`, DSQL_REASONS.materializedView)],
			},
		],
		alter_view: [
			{
				name: 'change view options',
				from: {
					schema,
					base: base(),
					v: schema.view('av').with({ securityBarrier: true }).as((qb) => qb.select({ id: base().id }).from(base())),
				},
				to: {
					schema,
					base: base(),
					v: schema.view('av').with({ securityInvoker: true }).as((qb) => qb.select({ id: base().id }).from(base())),
				},
			},
			{
				name: 'reject changing a materialized view',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_amv_ok')} ("id" uuid PRIMARY KEY)`,
						rejected: `ALTER MATERIALIZED VIEW ${q('cn_amv')} SET (fillfactor = 70)`,
						sqlstate: '0A000',
						message: 'unsupported object in ALTER statement',
					},
				],
				from: {
					schema,
					base: base(),
					v: schema.materializedView('amv').with({ fillfactor: 70 }).as((qb) =>
						qb.select({ id: base().id }).from(base())
					),
				},
				to: {
					schema,
					base: base(),
					v: schema.materializedView('amv').with({ fillfactor: 80 }).as((qb) =>
						qb.select({ id: base().id }).from(base())
					),
				},
				issues: [reject('alter_view', `${s}.amv`, DSQL_REASONS.materializedView)],
			},
		],
		create_role: [
			{
				name: 'create roles',
				from: {},
				to: {
					r1: pgRole(role('login'), { canLogin: true }),
					r2: pgRole(role('creator'), { createRole: true, inherit: false }),
				},
				roles: [role('login'), role('creator')],
			},
			{
				name: 'reject CREATEDB',
				from: {},
				to: { r: pgRole(role('db'), { createDb: true }) },
				issues: [reject('create_role', role('db'), DSQL_REASONS.roleOption('CREATEDB'))],
				roles: [role('db'), role('canary')],
				canary: {
					setup: [],
					ok: `CREATE ROLE "${role('canary')}" WITH LOGIN`,
					rejected: `CREATE ROLE "${role('canary_db')}" WITH CREATEDB`,
					sqlstate: '0A000',
					message: 'unsupported role option(s)',
				},
			},
			{
				name: "reject role options pgRole can't declare",
				roles: [role('cn_ok')],
				canaries: [
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_su')}" WITH SUPERUSER`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_rep')}" WITH REPLICATION`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_byp')}" WITH BYPASSRLS`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_lim')}" WITH CONNECTION LIMIT 5`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_pw')}" WITH PASSWORD 'x'`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [],
						ok: `CREATE ROLE "${role('cn_ok')}" WITH LOGIN`,
						rejected: `CREATE ROLE "${role('cn_vu')}" WITH VALID UNTIL '2030-01-01'`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
				],
				direct: [
					{ type: 'create_role', role: roleRow(role('su'), { superuser: true }) },
					{ type: 'create_role', role: roleRow(role('rep'), { replication: true }) },
					{ type: 'create_role', role: roleRow(role('bypass'), { bypassRls: true }) },
					{ type: 'create_role', role: roleRow(role('limit'), { connLimit: 5 }) },
					{ type: 'create_role', role: roleRow(role('pw'), { password: 'secret' }) },
					{ type: 'create_role', role: roleRow(role('until'), { validUntil: '2030-01-01' }) },
				] as JsonStatement[],
				issues: [
					reject('create_role', role('su'), DSQL_REASONS.roleOption('SUPERUSER')),
					reject('create_role', role('rep'), DSQL_REASONS.roleOption('REPLICATION')),
					reject('create_role', role('bypass'), DSQL_REASONS.roleOption('BYPASSRLS')),
					reject('create_role', role('limit'), DSQL_REASONS.roleOption('CONNECTION LIMIT')),
					reject('create_role', role('pw'), DSQL_REASONS.roleOption('PASSWORD')),
					reject('create_role', role('until'), DSQL_REASONS.roleOption('VALID UNTIL')),
				],
			},
			{
				name: 'reject creating a DSQL system role',
				canaries: [
					{
						setup: [],
						ok: `CREATE TABLE ${q('cn_crsys_ok')} ("id" uuid PRIMARY KEY)`,
						rejected: `CREATE ROLE "admin"`,
						sqlstate: '42710',
						message: 'role "admin" already exists',
					},
				],
				from: {},
				to: { r: pgRole('admin') },
				issues: [reject('create_role', 'admin', DSQL_REASONS.systemRole('admin'))],
			},
		],
		alter_role: [
			{
				name: 'alter role options',
				from: { r: pgRole(role('alter')) },
				to: { r: pgRole(role('alter'), { canLogin: true, createRole: true, inherit: false }) },
				roles: [role('alter')],
			},
			{
				name: 'reject altering a role to CREATEDB',
				from: { r: pgRole(role('alterdb')) },
				to: { r: pgRole(role('alterdb'), { createDb: true }) },
				issues: [reject('alter_role', role('alterdb'), DSQL_REASONS.roleOption('CREATEDB'))],
				roles: [role('alterdb')],
			},
			{
				name: "reject altering role options pgRole can't declare, in both directions",
				roles: [role('cn_alt')],
				canaries: [
					{
						setup: [`CREATE ROLE "${role('cn_alt')}"`],
						ok: `ALTER ROLE "${role('cn_alt')}" WITH LOGIN`,
						rejected: `ALTER ROLE "${role('cn_alt')}" WITH NOSUPERUSER`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [`CREATE ROLE "${role('cn_alt')}"`],
						ok: `ALTER ROLE "${role('cn_alt')}" WITH LOGIN`,
						rejected: `ALTER ROLE "${role('cn_alt')}" WITH NOCREATEDB`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
					{
						setup: [`CREATE ROLE "${role('cn_alt')}"`],
						ok: `ALTER ROLE "${role('cn_alt')}" WITH LOGIN`,
						rejected: `ALTER ROLE "${role('cn_alt')}" WITH CONNECTION LIMIT -1`,
						sqlstate: '0A000',
						message: 'unsupported role option(s)',
					},
				],
				direct: (
					[
						['superuser', 'SUPERUSER', true],
						['replication', 'REPLICATION', true],
						['bypassRls', 'BYPASSRLS', true],
						['connLimit', 'CONNECTION LIMIT', 5],
						['password', 'PASSWORD', 'secret'],
						['validUntil', 'VALID UNTIL', '2030-01-01'],
						['createDb', 'CREATEDB', true],
					] as const
				).flatMap(([field, , value]) => {
					const off = roleRow(role(`a_${field}`));
					const on = roleRow(role(`a_${field}`), { [field]: value });
					return [
						{ type: 'alter_role', role: on, diff: { [field]: { from: off[field], to: on[field] } } },
						{ type: 'alter_role', role: off, diff: { [field]: { from: on[field], to: off[field] } } },
					];
				}) as unknown as JsonStatement[],
				issues: (
					[
						['superuser', 'SUPERUSER'],
						['replication', 'REPLICATION'],
						['bypassRls', 'BYPASSRLS'],
						['connLimit', 'CONNECTION LIMIT'],
						['password', 'PASSWORD'],
						['validUntil', 'VALID UNTIL'],
						['createDb', 'CREATEDB'],
					] as const
				).flatMap(([field, option]) => [
					reject('alter_role', role(`a_${field}`), DSQL_REASONS.roleOption(option)),
					reject('alter_role', role(`a_${field}`), DSQL_REASONS.roleOption(option)),
				]),
			},
			{
				// No canary: probing it would try to change DSQL's own role.
				name: 'reject altering a DSQL system role',
				from: { r: pgRole('dbowner') },
				to: { r: pgRole('dbowner', { createRole: true }) },
				issues: [reject('alter_role', 'dbowner', DSQL_REASONS.systemRole('dbowner'))],
			},
		],
		rename_role: [
			{
				name: 'rename a role',
				from: { r: pgRole(role('ren')) },
				to: { r: pgRole(role('ren2')) },
				renames: [`${role('ren')}->${role('ren2')}`],
				roles: [role('ren'), role('ren2')],
			},
			{
				name: 'reject renaming to or from a DSQL system role',
				roles: [role('cn_to_sys')],
				canaries: [
					{
						setup: [`CREATE ROLE "${role('cn_to_sys')}"`],
						ok: `ALTER ROLE "${role('cn_to_sys')}" WITH LOGIN`,
						rejected: `ALTER ROLE "${role('cn_to_sys')}" RENAME TO "dbowner"`,
						sqlstate: '42710',
						message: 'role "dbowner" already exists',
					},
				],
				direct: [
					{ type: 'rename_role', from: roleRow('admin'), to: roleRow(role('x')) },
					{ type: 'rename_role', from: roleRow(role('y')), to: roleRow('dbowner') },
				] as JsonStatement[],
				issues: [
					reject('rename_role', 'admin', DSQL_REASONS.systemRole('admin')),
					reject('rename_role', 'dbowner', DSQL_REASONS.systemRole('dbowner')),
				],
			},
		],
		drop_role: [
			{
				name: 'drop a role',
				from: { r: pgRole(role('drop')) },
				to: {},
				roles: [role('drop')],
			},
			{
				// No canary: probing it would try to drop DSQL's own role.
				name: 'reject dropping a DSQL system role',
				from: { r: pgRole('admin') },
				to: {},
				issues: [reject('drop_role', 'admin', DSQL_REASONS.systemRole('admin'))],
			},
		],
		grant_privilege: [
			{
				name: 'grant the privileges DSQL supports',
				direct: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRIGGER'].map((type) => ({
					type: 'grant_privilege',
					privilege: privilege(type),
				})) as JsonStatement[],
				roles: [role('grantee')],
				live: {
					setup: [`CREATE TABLE ${q('base')} ("id" uuid PRIMARY KEY)`, `CREATE ROLE "${role('grantee')}"`],
					check:
						`SELECT privilege_type || ':' || is_grantable AS "row" FROM information_schema.role_table_grants WHERE table_schema = '${s}' AND table_name = 'base' AND grantee = '${
							role('grantee')
						}'`,
					includes: ['SELECT:NO', 'INSERT:NO', 'UPDATE:NO', 'DELETE:NO', 'TRIGGER:NO'],
				},
			},
			{
				name: 'reject granting TRUNCATE and REFERENCES',
				canaries: [
					{
						setup: [`CREATE TABLE ${q('cn_grant')} ("id" uuid PRIMARY KEY)`, `CREATE ROLE "${role('grantee')}"`],
						ok: `GRANT SELECT ON ${q('cn_grant')} TO "${role('grantee')}"`,
						rejected: `GRANT REFERENCES ON ${q('cn_grant')} TO "${role('grantee')}"`,
						sqlstate: '0A000',
						message: 'unsupported privilege in GRANT',
					},
				],
				direct: ['TRUNCATE', 'REFERENCES'].map((type) => ({
					type: 'grant_privilege',
					privilege: privilege(type),
				})) as JsonStatement[],
				issues: [
					reject('grant_privilege', `${role('grantee')} on ${s}.base`, DSQL_REASONS.privilege('TRUNCATE')),
					reject('grant_privilege', `${role('grantee')} on ${s}.base`, DSQL_REASONS.privilege('REFERENCES')),
				],
				roles: [role('grantee')],
				canary: {
					setup: [`CREATE TABLE ${q('canary_grant')} ("id" uuid PRIMARY KEY)`, `CREATE ROLE "${role('grantee')}"`],
					ok: `GRANT SELECT ON ${q('canary_grant')} TO "${role('grantee')}"`,
					rejected: `GRANT TRUNCATE ON ${q('canary_grant')} TO "${role('grantee')}"`,
					sqlstate: '0A000',
					message: 'unsupported privilege in GRANT',
				},
			},
		],
		revoke_privilege: [
			{
				name: 'revoke a privilege',
				direct: [{ type: 'revoke_privilege', privilege: privilege('SELECT') }] as JsonStatement[],
				roles: [role('grantee')],
				live: {
					setup: [
						`CREATE TABLE ${q('base')} ("id" uuid PRIMARY KEY)`,
						`CREATE ROLE "${role('grantee')}"`,
						`GRANT SELECT ON ${q('base')} TO "${role('grantee')}"`,
					],
					check:
						`SELECT privilege_type || ':' || is_grantable AS "row" FROM information_schema.role_table_grants WHERE table_schema = '${s}' AND table_name = 'base' AND grantee = '${
							role('grantee')
						}'`,
					excludes: ['SELECT:NO', 'SELECT:YES'],
				},
			},
			{
				name: 'reject revoking TRUNCATE',
				roles: [role('grantee')],
				canaries: [
					{
						setup: [`CREATE TABLE ${q('cn_revoke')} ("id" uuid PRIMARY KEY)`, `CREATE ROLE "${role('grantee')}"`],
						ok: `REVOKE SELECT ON ${q('cn_revoke')} FROM "${role('grantee')}"`,
						rejected: `REVOKE TRUNCATE ON ${q('cn_revoke')} FROM "${role('grantee')}"`,
						sqlstate: '0A000',
						message: 'unsupported privilege in REVOKE',
					},
				],
				direct: [{ type: 'revoke_privilege', privilege: privilege('TRUNCATE') }] as JsonStatement[],
				issues: [
					reject('revoke_privilege', `${role('grantee')} on ${s}.base`, DSQL_REASONS.privilege('TRUNCATE')),
				],
			},
		],
		regrant_privilege: [
			{
				name: 'regrant a privilege',
				direct: [{
					type: 'regrant_privilege',
					privilege: { ...privilege('SELECT'), isGrantable: true },
					diff: { isGrantable: { from: false, to: true } },
				}] as unknown as JsonStatement[],
				roles: [role('grantee')],
				live: {
					setup: [
						`CREATE TABLE ${q('base')} ("id" uuid PRIMARY KEY)`,
						`CREATE ROLE "${role('grantee')}"`,
						`GRANT SELECT ON ${q('base')} TO "${role('grantee')}"`,
					],
					check:
						`SELECT privilege_type || ':' || is_grantable AS "row" FROM information_schema.role_table_grants WHERE table_schema = '${s}' AND table_name = 'base' AND grantee = '${
							role('grantee')
						}'`,
					includes: ['SELECT:YES'],
				},
			},
			{
				name: 'reject regranting REFERENCES',
				direct: [{
					type: 'regrant_privilege',
					privilege: { ...privilege('REFERENCES'), isGrantable: true },
					diff: { isGrantable: { from: false, to: true } },
				}] as unknown as JsonStatement[],
				issues: [
					reject('regrant_privilege', `${role('grantee')} on ${s}.base`, DSQL_REASONS.privilege('REFERENCES')),
				],
			},
		],
	} satisfies Record<JsonStatement['type'], DsqlCase[]>;

	return cases;
};
