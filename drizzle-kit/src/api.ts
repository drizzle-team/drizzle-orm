import { MigrationConfig } from 'drizzle-orm/migrator';
import { Minimatch } from 'minimatch';
import {
	columnsResolver,
	enumsResolver,
	indPolicyResolver,
	policyResolver,
	roleResolver,
	schemasResolver,
	sequencesResolver,
	tablesResolver,
	viewsResolver,
} from './cli/commands/migrate';
import { pgSuggestions } from './cli/commands/pgPushUtils';
import { PostgresCredentials } from './cli/validations/postgres';
import { originUUID } from './global';
import { MySqlSchema as MySQLSchemaKit } from './serializer/mysqlSchema';
import { PgSchema as PgSchemaKit, pgSchema, Role, squashPgScheme, View } from './serializer/pgSchema';
import { fromDatabase } from './serializer/pgSerializer';
import { SingleStoreSchema as SingleStoreSchemaKit } from './serializer/singlestoreSchema';
import { SQLiteSchema as SQLiteSchemaKit } from './serializer/sqliteSchema';
import { ProxyParams } from './serializer/studio';
import type { DB, Proxy } from './utils';
export type DrizzleSnapshotJSON = PgSchemaKit;
export type DrizzleSQLiteSnapshotJSON = SQLiteSchemaKit;
export type DrizzleMySQLSnapshotJSON = MySQLSchemaKit;
export type DrizzleSingleStoreSnapshotJSON = SingleStoreSchemaKit;

// Replit api
export type DrizzlePostgresCredentials = PostgresCredentials;
export type DrizzlePgDB = DB & {
	proxy: Proxy;
	migrate: (config: string | MigrationConfig) => Promise<void>;
};
export type DrizzlePgDBIntrospectSchema = Omit<
	PgSchemaKit,
	'internal'
>;

export const introspectPgDB = async (
	db: DrizzlePgDB,
	filters: string[],
	schemaFilters: string[],
): Promise<DrizzlePgDBIntrospectSchema> => {
	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};

	const res = await fromDatabase(
		db,
		filter,
		schemaFilters,
		undefined,
		undefined,
		undefined,
	);

	const schema = { id: originUUID, prevId: '', ...res } as PgSchemaKit;
	const { internal, ...schemaWithoutInternals } = schema;
	return schemaWithoutInternals;
};

export const preparePgDB = async (
	credentials: DrizzlePostgresCredentials,
): Promise<
	DrizzlePgDB
> => {
	console.log(`Using 'pg' driver for database querying`);
	const { default: pg } = await import('pg');
	const { drizzle } = await import('drizzle-orm/node-postgres');
	const { migrate } = await import('drizzle-orm/node-postgres/migrator');

	const ssl = 'ssl' in credentials
		? credentials.ssl === 'prefer'
				|| credentials.ssl === 'require'
				|| credentials.ssl === 'allow'
			? { rejectUnauthorized: false }
			: credentials.ssl === 'verify-full'
			? {}
			: credentials.ssl
		: {};

	// Override pg default date parsers
	const types: { getTypeParser: typeof pg.types.getTypeParser } = {
		// @ts-ignore
		getTypeParser: (typeId, format) => {
			if (typeId === pg.types.builtins.TIMESTAMPTZ) {
				return (val: any) => val;
			}
			if (typeId === pg.types.builtins.TIMESTAMP) {
				return (val: any) => val;
			}
			if (typeId === pg.types.builtins.DATE) {
				return (val: any) => val;
			}
			if (typeId === pg.types.builtins.INTERVAL) {
				return (val: any) => val;
			}
			// @ts-ignore
			return pg.types.getTypeParser(typeId, format);
		},
	};

	const client = 'url' in credentials
		? new pg.Pool({ connectionString: credentials.url, max: 1 })
		: new pg.Pool({ ...credentials, ssl, max: 1 });

	const db = drizzle(client);
	const migrateFn = async (config: MigrationConfig) => {
		return migrate(db, config);
	};

	const query = async (sql: string, params?: any[]) => {
		const result = await client.query({
			text: sql,
			values: params ?? [],
			types,
		});
		return result.rows;
	};

	const proxy: Proxy = async (params: ProxyParams) => {
		const result = await client.query({
			text: params.sql,
			values: params.params,
			...(params.mode === 'array' && { rowMode: 'array' }),
			types,
		});
		return result.rows;
	};

	return { query, proxy, migrate: migrateFn };
};

export const getPgClientPool = async (
	targetCredentials: DrizzlePostgresCredentials,
) => {
	const { default: pg } = await import('pg');
	const pool = 'url' in targetCredentials
		? new pg.Pool({ connectionString: targetCredentials.url, max: 1 })
		: new pg.Pool({ ...targetCredentials, ssl: undefined, max: 1 });

	return pool;
};

export { applyPgSnapshotsDiff } from './snapshotsDiffer';
export type {
	ColumnsResolverInput,
	Enum,
	PolicyResolverInput,
	ResolverInput,
	RolesResolverInput,
	Sequence,
	Table,
	TablePolicyResolverInput,
} from './snapshotsDiffer';
export {
	columnsResolver,
	enumsResolver,
	indPolicyResolver,
	pgSchema,
	pgSuggestions,
	policyResolver,
	roleResolver,
	schemasResolver,
	sequencesResolver,
	squashPgScheme,
	tablesResolver,
	viewsResolver,
};
export type { Role, View };
