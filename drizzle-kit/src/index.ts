import type { TypeOf } from 'zod';
import type { cockroachCredentials } from './cli/validations/cockroach';
import type { Driver, postgresDriver, sqliteDriver } from './cli/validations/common';
import type { duckdbCredentials } from './cli/validations/duckdb';
import type { libSQLCredentials } from './cli/validations/libsql';
import type { mssqlCredentials } from './cli/validations/mssql';
import type { mysqlCredentials } from './cli/validations/mysql';
import type {
	awsDataApiCredentials,
	dsqlCredentials,
	pgDefaultCredentials,
	pgLiteClientCredentials,
	pgLiteCredentials,
} from './cli/validations/postgres';
import type { singlestoreCredentials } from './cli/validations/singlestore';
import type { d1HttpCredentials, sqliteCloudCredentials, sqliteDefaultCredentials } from './cli/validations/sqlite';
import type { Dialect } from './utils/schemaValidator';

/**
 * **You are currently using version 0.21.0+ of drizzle-kit. If you have just upgraded to this version, please make sure to read the changelog to understand what changes have been made and what
 * adjustments may be necessary for you. See https://orm.drizzle.team/kit-docs/upgrade-21#how-to-migrate-to-0210**
 *
 * **Config** usage:
 *
 * `dialect` - mandatory and is responsible for explicitly providing a databse dialect you are using for all the commands
 * *Possible values*: `postgresql`, `mysql`, `sqlite`, `singlestore
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#dialect
 *
 * ---
 * `schema` - param lets you define where your schema file/files live.
 * You can have as many separate schema files as you want and define paths to them using glob or array of globs syntax.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#schema
 *
 * ---
 * `out` - allows you to define the folder for your migrations and a folder, where drizzle will introspect the schema and relations
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#out
 *
 * ---
 * `driver` - optional param that is responsible for explicitly providing a driver to use when accessing a database
 * *Possible values*: `aws-data-api`, `d1-http`, `expo`, `turso`, `pglite`
 * If you don't use AWS Data API, D1, Turso or Expo - ypu don't need this driver. You can check a driver strategy choice here: https://orm.drizzle.team/kit-docs/upgrade-21
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#driver
 *
 * ---
 *
 * `dbCredentials` - an object to define your connection to the database. For more info please check the docs
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#dbcredentials
 *
 * ---
 *
 * `migrations` - param let’s you specify a custom table and schema(PostgreSQL only) for migrations.
 * By default, all information about executed migrations will be stored in the database inside
 * the `__drizzle_migrations` table, and for PostgreSQL, inside the drizzle schema.
 * However, you can configure where to store those records.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#migrations
 *
 * ---
 *
 * `breakpoints` - param lets you enable/disable SQL statement breakpoints in generated migrations.
 * It’s optional and true by default, it’s necessary to properly apply migrations on databases,
 * that do not support multiple DDL alternation statements in one transaction(MySQL, SQLite, SingleStore) and
 * Drizzle ORM has to apply them sequentially one by one.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#breakpoints
 *
 * ---
 *
 * `tablesFilters` - param lets you filter tables with glob syntax for db push command.
 * It’s useful when you have only one database avaialable for several separate projects with separate sql schemas.
 *
 * How to define multi-project tables with Drizzle ORM — see https://orm.drizzle.team/docs/goodies#multi-project-schema
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#tablesfilters
 *
 * ---
 *
 * `schemaFilter` - parameter allows you to define which schema in PostgreSQL should be used for either introspect or push commands.
 * This parameter accepts a single schema as a string or an array of schemas as strings.
 * No glob pattern is supported here. By default, drizzle will use the public schema for both commands,
 * but you can add any schema you need.
 *
 * For example, having schemaFilter: ["my_schema"] will only look for tables in both the database and
 * drizzle schema that are a part of the my_schema schema.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#schemafilter
 *
 * ---
 *
 * `verbose` - command is used for drizzle-kit push commands and prints all statements that will be executed.
 *
 * > Note: This command will only print the statements that should be executed.
 * To approve them before applying, please refer to the `strict` command.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#verbose
 *
 * ---
 *
 * `strict` - command is used for drizzle-kit push commands and will always ask for your confirmation,
 * either to execute all statements needed to sync your schema with the database or not.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#strict
 */
export type Config<
	TDialect extends Dialect = Dialect,
	TDriver extends DialectDriverMap[TDialect] = DialectDriverMap[TDialect],
> = TDialect extends Dialect ? TDriver extends DialectDriverMap[TDialect] ? ConfigVariant<TDialect, TDriver> : never
	: never;

export type ConfigVariant<TDialect extends Dialect, TDriver extends DialectDriverMap[TDialect]> =
	& {
		dialect: TDialect;
		out?: string;
		breakpoints?: boolean;
		/**
		 * Whether `drizzle-kit generate` should emit a `down.sql` rollback file
		 * alongside each `migration.sql`. Defaults to `true`.
		 *
		 * Set to `false` if you prefer to author rollback SQL entirely by hand —
		 * useful when you regularly edit `migration.sql` to add data migrations
		 * or custom DDL that the schema-diff can't mirror automatically.
		 */
		generateDownMigrations?: boolean;
		tablesFilter?: string | string[];
		extensionsFilters?: 'postgis'[];
		schemaFilter?: string | string[];
		schema?: string | string[];
		verbose?: boolean;
		migrations?: {
			table?: string;
			schema?: string;
		};
		introspect?: {
			casing: 'camel' | 'preserve';
		};
		entities?: {
			roles?: boolean | { provider?: 'supabase' | 'neon' | string & {}; exclude?: string[]; include?: string[] };
		};
	}
	& (TDriver extends 'default' ? { driver?: undefined } : { driver: TDriver })
	& (DialectCredentials[TDialect][TDriver & keyof DialectCredentials[TDialect]] | {});

type ExclusiveUnion<T, TKeys extends PropertyKey = T extends object ? keyof T : never> = T extends object
	? { [K in keyof T]: ExclusiveProperty<T[K]> } & { [K in Exclude<TKeys, keyof T>]?: never }
	: T;

type ExclusiveProperty<T> = true extends IsUnion<Extract<T, object>> ? ExclusiveUnion<T> : T;

type IsUnion<T, TAll = T> = T extends unknown ? ([TAll] extends [T] ? false : true) : never;

export interface DialectDriverMap extends Record<Dialect, Driver | 'default'> {
	postgresql: 'default' | TypeOf<(typeof postgresDriver)>;
	mysql: 'default';
	sqlite: 'default' | TypeOf<(typeof sqliteDriver)>;
	turso: 'default';
	singlestore: 'default';
	mssql: 'default';
	cockroach: 'default';
	duckdb: 'default';
}

export interface DialectCredentials {
	turso: { default: { dbCredentials: TypeOf<typeof libSQLCredentials> } };
	postgresql: {
		default: { dbCredentials: ExclusiveUnion<TypeOf<typeof pgDefaultCredentials>> };
		'aws-data-api': { dbCredentials: TypeOf<typeof awsDataApiCredentials> };
		pglite: ExclusiveUnion<
			| {
				dbCredentials: TypeOf<typeof pgLiteCredentials>;
			}
			| TypeOf<typeof pgLiteClientCredentials>
		>;
		dsql: { dbCredentials: TypeOf<typeof dsqlCredentials> };
	};
	mysql: { default: { dbCredentials: ExclusiveUnion<TypeOf<typeof mysqlCredentials>> } };
	sqlite: {
		default: { dbCredentials: TypeOf<typeof sqliteDefaultCredentials> };
		'd1-http': { dbCredentials: TypeOf<typeof d1HttpCredentials> };
		expo: {};
		'durable-sqlite': {};
		'sqlite-cloud': { dbCredentials: TypeOf<typeof sqliteCloudCredentials> };
	};
	singlestore: { default: { dbCredentials: ExclusiveUnion<TypeOf<typeof singlestoreCredentials>> } };
	mssql: { default: { dbCredentials: ExclusiveUnion<TypeOf<typeof mssqlCredentials>> } };
	cockroach: { default: { dbCredentials: ExclusiveUnion<TypeOf<typeof cockroachCredentials>> } };
	duckdb: { default: { dbCredentials: TypeOf<typeof duckdbCredentials> } };
}

/**
 * **You are currently using version 0.21.0+ of drizzle-kit. If you have just upgraded to this version, please make sure to read the changelog to understand what changes have been made and what
 * adjustments may be necessary for you. See https://orm.drizzle.team/kit-docs/upgrade-21#how-to-migrate-to-0210**
 *
 * **Config** usage:
 *
 * `dialect` - mandatory and is responsible for explicitly providing a databse dialect you are using for all the commands
 * *Possible values*: `postgresql`, `mysql`, `sqlite`, `singlestore`, `gel`
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#dialect
 *
 * ---
 * `schema` - param lets you define where your schema file/files live.
 * You can have as many separate schema files as you want and define paths to them using glob or array of globs syntax.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#schema
 *
 * ---
 * `out` - allows you to define the folder for your migrations and a folder, where drizzle will introspect the schema and relations
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#out
 *
 * ---
 * `driver` - optional param that is responsible for explicitly providing a driver to use when accessing a database
 * *Possible values*: `aws-data-api`, `d1-http`, `expo`, `turso`, `pglite`
 * If you don't use AWS Data API, D1, Turso or Expo - ypu don't need this driver. You can check a driver strategy choice here: https://orm.drizzle.team/kit-docs/upgrade-21
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#driver
 *
 * ---
 *
 * `dbCredentials` - an object to define your connection to the database. For more info please check the docs
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#dbcredentials
 *
 * ---
 *
 * `migrations` - param let’s you specify a custom table and schema(PostgreSQL only) for migrations.
 * By default, all information about executed migrations will be stored in the database inside
 * the `__drizzle_migrations` table, and for PostgreSQL, inside the drizzle schema.
 * However, you can configure where to store those records.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#migrations
 *
 * ---
 *
 * `breakpoints` - param lets you enable/disable SQL statement breakpoints in generated migrations.
 * It’s optional and true by default, it’s necessary to properly apply migrations on databases,
 * that do not support multiple DDL alternation statements in one transaction(MySQL, SQLite, SingleStore) and
 * Drizzle ORM has to apply them sequentially one by one.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#breakpoints
 *
 * ---
 *
 * `tablesFilters` - param lets you filter tables with glob syntax for db push command.
 * It’s useful when you have only one database avaialable for several separate projects with separate sql schemas.
 *
 * How to define multi-project tables with Drizzle ORM — see https://orm.drizzle.team/docs/goodies#multi-project-schema
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#tablesfilters
 *
 * ---
 *
 * `schemaFilter` - parameter allows you to define which schema in PostgreSQL should be used for either introspect or push commands.
 * This parameter accepts a single schema as a string or an array of schemas as strings.
 * No glob pattern is supported here. By default, drizzle will use the public schema for both commands,
 * but you can add any schema you need.
 *
 * For example, having schemaFilter: ["my_schema"] will only look for tables in both the database and
 * drizzle schema that are a part of the my_schema schema.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#schemafilter
 *
 * ---
 *
 * `verbose` - command is used for drizzle-kit push commands and prints all statements that will be executed.
 *
 * > Note: This command will only print the statements that should be executed.
 * To approve them before applying, please refer to the `strict` command.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#verbose
 *
 * ---
 *
 * `strict` - command is used for drizzle-kit push commands and will always ask for your confirmation,
 * either to execute all statements needed to sync your schema with the database or not.
 *
 * See https://orm.drizzle.team/kit-docs/config-reference#strict
 */
export function defineConfig<TDialect extends Dialect, TDriver extends DialectDriverMap[TDialect] = 'default'>(
	config: Config<TDialect, TDriver>,
) {
	return config;
}
