import { ConnectionOptions } from 'tls';
import type { Driver, Prefix } from './cli/validations/common';
import type { Dialect } from './schemaValidator';

// import {SslOptions} from 'mysql2'
type SslOptions = {
	pfx?: string;
	key?: string;
	passphrase?: string;
	cert?: string;
	ca?: string | string[];
	crl?: string | string[];
	ciphers?: string;
	rejectUnauthorized?: boolean;
};

type Verify<T, U extends T> = U;

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
 * `migrations` - param let’s use specify custom table and schema(PostgreSQL only) for migrations.
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
/**
 * Input passed to `columnTypeMapper` for each column encountered during `drizzle-kit pull`.
 */
export type ColumnTypeMapperInput = {
	/** Column name as reported by the database. */
	column: string;
	/** Table name as reported by the database. */
	table: string;
	/** Schema name (PostgreSQL only). `undefined` for dialects without schemas. */
	schema: string | undefined;
	/** Raw SQL type string as reported by the database, e.g. `"timestamp with time zone"`. */
	sqlType: string;
	/** Whether the column allows NULL values. */
	nullable: boolean;
};

/**
 * Returned from `columnTypeMapper` to override how a column is rendered.
 *
 * Two shapes are supported:
 *
 * 1. **Built-in mode override** – sets the `mode` option on a Drizzle-native column type:
 *    ```ts
 *    return { mode: 'date' };
 *    ```
 *
 * 2. **Custom type reference** – replaces the built-in column call entirely with a
 *    user-defined `customType()`. The generator will import `typeName` from `typeImport.from`
 *    and emit `typeName('col_name')` instead of e.g. `timestamp('col_name', { mode: 'string' })`:
 *    ```ts
 *    return {
 *      typeName: 'dayjsTimestamp',
 *      typeImport: { name: 'dayjsTimestamp', from: './custom-types' },
 *    };
 *    ```
 */
export type ColumnTypeMapperOutput =
	| { mode: 'string' | 'date' }
	| {
		/** Identifier of the custom type factory to use in generated code. */
		typeName: string;
		/** Import statement info so the generated file can reference the custom type. */
		typeImport: {
			/** Exported symbol name (may differ from `typeName` if re-exported). */
			name: string;
			/** Module specifier, e.g. `"./custom-types"` or `"my-drizzle-types"`. */
			from: string;
		};
	};

/**
 * Callback invoked once per column during `drizzle-kit pull`.
 * Return a {@link ColumnTypeMapperOutput} to override the generated column definition,
 * or `undefined`/`null` to fall back to the default behaviour.
 *
 * @example – use native `Date` for all timestamps
 * ```ts
 * columnTypeMapper: ({ sqlType }) => {
 *   if (sqlType.startsWith('timestamp')) return { mode: 'date' };
 * }
 * ```
 *
 * @example – replace timestamps with a dayjs custom type
 * ```ts
 * columnTypeMapper: ({ sqlType }) => {
 *   if (sqlType.startsWith('timestamp')) {
 *     return {
 *       typeName: 'dayjsTimestamp',
 *       typeImport: { name: 'dayjsTimestamp', from: './custom-types' },
 *     };
 *   }
 * }
 * ```
 */
export type ColumnTypeMapper = (
	input: ColumnTypeMapperInput,
) => ColumnTypeMapperOutput | null | undefined;

export type Config =
	& {
		dialect: Dialect;
		out?: string;
		breakpoints?: boolean;
		tablesFilter?: string | string[];
		extensionsFilters?: 'postgis'[];
		schemaFilter?: string | string[];
		schema?: string | string[];
		verbose?: boolean;
		strict?: boolean;
		casing?: 'camelCase' | 'snake_case';
		migrations?: {
			table?: string;
			schema?: string;
			prefix?: Prefix;
		};
		introspect?: {
			casing: 'camel' | 'preserve';
			/**
			 * Customize how columns are rendered during `drizzle-kit pull`.
			 * See {@link ColumnTypeMapper} for full documentation and examples.
			 */
			columnTypeMapper?: ColumnTypeMapper;
		};
		entities?: {
			roles?: boolean | { provider?: 'supabase' | 'neon' | string & {}; exclude?: string[]; include?: string[] };
		};
	}
	& (
		| {
			dialect: Verify<Dialect, 'turso'>;
			dbCredentials: {
				url: string;
				authToken?: string;
			};
		}
		| {
			dialect: Verify<Dialect, 'sqlite'>;
			dbCredentials: {
				url: string;
			};
		}
		| {
			dialect: Verify<Dialect, 'postgresql'>;
			dbCredentials:
				| ({
					host: string;
					port?: number;
					user?: string;
					password?: string;
					database: string;
					ssl?:
						| boolean
						| 'require'
						| 'allow'
						| 'prefer'
						| 'verify-full'
						| ConnectionOptions;
				} & {})
				| {
					url: string;
				};
		}
		| {
			dialect: Verify<Dialect, 'postgresql'>;
			driver: Verify<Driver, 'aws-data-api'>;
			dbCredentials: {
				database: string;
				secretArn: string;
				resourceArn: string;
			};
		}
		| {
			dialect: Verify<Dialect, 'postgresql'>;
			driver: Verify<Driver, 'pglite'>;
			dbCredentials: {
				url: string;
			};
		}
		| {
			dialect: Verify<Dialect, 'mysql'>;
			dbCredentials:
				| {
					host: string;
					port?: number;
					user?: string;
					password?: string;
					database: string;
					ssl?: string | SslOptions;
				}
				| {
					url: string;
				};
		}
		| {
			dialect: Verify<Dialect, 'sqlite'>;
			driver: Verify<Driver, 'd1-http'>;
			dbCredentials: {
				accountId: string;
				databaseId: string;
				token: string;
			};
		}
		| {
			dialect: Verify<Dialect, 'sqlite'>;
			driver: Verify<Driver, 'expo'>;
		}
		| {
			dialect: Verify<Dialect, 'sqlite'>;
			driver: Verify<Driver, 'durable-sqlite'>;
		}
		| {}
		| {
			dialect: Verify<Dialect, 'singlestore'>;
			dbCredentials:
				| {
					host: string;
					port?: number;
					user?: string;
					password?: string;
					database: string;
					ssl?: string | SslOptions;
				}
				| {
					url: string;
				};
		}
		| {
			dialect: Verify<Dialect, 'gel'>;
			dbCredentials?:
				& {
					tlsSecurity?:
						| 'insecure'
						| 'no_host_verification'
						| 'strict'
						| 'default';
				}
				& (
					| {
						url: string;
					}
					| ({
						host: string;
						port?: number;
						user?: string;
						password?: string;
						database: string;
					})
				);
		}
	);

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
 * `migrations` - param let’s use specify custom table and schema(PostgreSQL only) for migrations.
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
export function defineConfig(config: Config) {
	return config;
}
