import type { PGlite } from '@electric-sql/pglite';
import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { createHash } from 'crypto';
import { AnyColumn, AnyTable, is } from 'drizzle-orm';
import { AnyMySqlTable, getTableConfig as mysqlTableConfig, MySqlTable } from 'drizzle-orm/mysql-core';
import { AnyPgTable, getTableConfig as pgTableConfig, PgTable } from 'drizzle-orm/pg-core';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	Many,
	normalizeRelation,
	One,
	Relations,
	TablesRelationalConfig,
} from 'drizzle-orm/relations';
import {
	AnySingleStoreTable,
	getTableConfig as singlestoreTableConfig,
	SingleStoreTable,
} from 'drizzle-orm/singlestore-core';
import { AnySQLiteTable, getTableConfig as sqliteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import fs from 'fs';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { createServer } from 'node:https';
import { CasingType } from 'src/cli/validations/common';
import { LibSQLCredentials } from 'src/cli/validations/libsql';
import { assertUnreachable } from 'src/global';
import { z } from 'zod';
import { safeRegister } from '../cli/commands/utils';
import type { MysqlCredentials } from '../cli/validations/mysql';
import type { PostgresCredentials } from '../cli/validations/postgres';
import type { SingleStoreCredentials } from '../cli/validations/singlestore';
import type { SqliteCredentials } from '../cli/validations/sqlite';
import type { Proxy, TransactionProxy } from '../utils';
import { prepareFilenames } from '.';
import { getColumnCasing } from './utils';

type CustomDefault = {
	schema: string;
	table: string;
	column: string;
	func: () => unknown;
};

type SchemaFile = {
	name: string;
	content: string;
};

export type Setup = {
	dbHash: string;
	dialect: 'postgresql' | 'mysql' | 'sqlite' | 'singlestore';
	packageName:
		| '@aws-sdk/client-rds-data'
		| 'pglite'
		| 'pg'
		| 'postgres'
		| '@vercel/postgres'
		| '@neondatabase/serverless'
		| 'gel'
		| 'mysql2'
		| '@planetscale/database'
		| 'd1-http'
		| '@libsql/client'
		| 'better-sqlite3';
	driver?: 'aws-data-api' | 'd1-http' | 'turso' | 'pglite';
	databaseName?: string; // for planetscale (driver remove database name from connection string)
	proxy: Proxy;
	transactionProxy: TransactionProxy;
	customDefaults: CustomDefault[];
	schema: Record<string, Record<string, AnyTable<any>>>;
	relations: Record<string, Relations>;
	casing?: CasingType;
	schemaFiles?: SchemaFile[];
};

export type ProxyParams = {
	sql: string;
	params?: any[];
	typings?: any[];
	mode: 'array' | 'object';
	method: 'values' | 'get' | 'all' | 'run' | 'execute';
};

export const preparePgSchema = async (path: string | string[]) => {
	const imports = prepareFilenames(path);
	const pgSchema: Record<string, Record<string, AnyPgTable>> = {};
	const relations: Record<string, Relations> = {};

	// files content as string
	const files = imports.map((it, index) => ({
		// get the file name from the path
		name: it.split('/').pop() || `schema${index}.ts`,
		content: fs.readFileSync(it, 'utf-8'),
	}));

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const i0values = Object.entries(i0);

		i0values.forEach(([k, t]) => {
			if (is(t, PgTable)) {
				const schema = pgTableConfig(t).schema || 'public';
				pgSchema[schema] = pgSchema[schema] || {};
				pgSchema[schema][k] = t;
			}

			if (is(t, Relations)) {
				relations[k] = t;
			}
		});
	}
	unregister();

	return { schema: pgSchema, relations, files };
};

export const prepareMySqlSchema = async (path: string | string[]) => {
	const imports = prepareFilenames(path);
	const mysqlSchema: Record<string, Record<string, AnyMySqlTable>> = {
		public: {},
	};
	const relations: Record<string, Relations> = {};

	// files content as string
	const files = imports.map((it, index) => ({
		// get the file name from the path
		name: it.split('/').pop() || `schema${index}.ts`,
		content: fs.readFileSync(it, 'utf-8'),
	}));

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const i0values = Object.entries(i0);

		i0values.forEach(([k, t]) => {
			if (is(t, MySqlTable)) {
				const schema = mysqlTableConfig(t).schema || 'public';
				mysqlSchema[schema][k] = t;
			}

			if (is(t, Relations)) {
				relations[k] = t;
			}
		});
	}
	unregister();

	return { schema: mysqlSchema, relations, files };
};

export const prepareSQLiteSchema = async (path: string | string[]) => {
	const imports = prepareFilenames(path);
	const sqliteSchema: Record<string, Record<string, AnySQLiteTable>> = {
		public: {},
	};
	const relations: Record<string, Relations> = {};

	// files content as string
	const files = imports.map((it, index) => ({
		// get the file name from the path
		name: it.split('/').pop() || `schema${index}.ts`,
		content: fs.readFileSync(it, 'utf-8'),
	}));

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const i0values = Object.entries(i0);

		i0values.forEach(([k, t]) => {
			if (is(t, SQLiteTable)) {
				const schema = 'public'; // sqlite does not have schemas
				sqliteSchema[schema][k] = t;
			}

			if (is(t, Relations)) {
				relations[k] = t;
			}
		});
	}
	unregister();

	return { schema: sqliteSchema, relations, files };
};

export const prepareSingleStoreSchema = async (path: string | string[]) => {
	const imports = prepareFilenames(path);
	const singlestoreSchema: Record<
		string,
		Record<string, AnySingleStoreTable>
	> = {
		public: {},
	};
	const relations: Record<string, Relations> = {};

	// files content as string
	const files = imports.map((it, index) => ({
		// get the file name from the path
		name: it.split('/').pop() || `schema${index}.ts`,
		content: fs.readFileSync(it, 'utf-8'),
	}));

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const i0values = Object.entries(i0);

		i0values.forEach(([k, t]) => {
			if (is(t, SingleStoreTable)) {
				const schema = singlestoreTableConfig(t).schema || 'public';
				singlestoreSchema[schema][k] = t;
			}

			if (is(t, Relations)) {
				relations[k] = t;
			}
		});
	}
	unregister();

	return { schema: singlestoreSchema, relations, files };
};

const getCustomDefaults = <T extends AnyTable<{}>>(
	schema: Record<string, Record<string, T>>,
	casing?: CasingType,
): CustomDefault[] => {
	const customDefaults: CustomDefault[] = [];

	Object.entries(schema).map(([schema, tables]) => {
		Object.entries(tables).map(([, table]) => {
			let tableConfig: {
				name: string;
				columns: AnyColumn[];
			};
			if (is(table, PgTable)) {
				tableConfig = pgTableConfig(table);
			} else if (is(table, MySqlTable)) {
				tableConfig = mysqlTableConfig(table);
			} else if (is(table, SQLiteTable)) {
				tableConfig = sqliteTableConfig(table);
			} else {
				tableConfig = singlestoreTableConfig(table as SingleStoreTable);
			}

			tableConfig.columns.map((column) => {
				if (column.defaultFn) {
					customDefaults.push({
						schema,
						table: tableConfig.name,
						column: getColumnCasing(column, casing),
						func: column.defaultFn,
					});
				}
			});
		});
	});

	return customDefaults;
};

export const drizzleForPostgres = async (
	credentials: PostgresCredentials | {
		driver: 'pglite';
		client: PGlite;
	},
	pgSchema: Record<string, Record<string, AnyPgTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { preparePostgresDB } = await import('../cli/connections');
	const db = await preparePostgresDB(credentials);
	const customDefaults = getCustomDefaults(pgSchema, casing);

	let dbUrl: string;

	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'aws-data-api') {
			dbUrl = `aws-data-api://${credentials.database}/${credentials.secretArn}/${credentials.resourceArn}`;
		} else if (driver === 'pglite') {
			dbUrl = 'client' in credentials ? credentials.client.dataDir || 'pglite://custom-client' : credentials.url;
		} else {
			assertUnreachable(driver);
		}
	} else if ('url' in credentials) {
		dbUrl = credentials.url;
	} else {
		dbUrl =
			`postgresql://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
	}

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'postgresql',
		driver: 'driver' in credentials ? credentials.driver : undefined,
		packageName: db.packageName,
		proxy: db.proxy,
		transactionProxy: db.transactionProxy,
		customDefaults,
		schema: pgSchema,
		relations,
		schemaFiles,
		casing,
	};
};

export const drizzleForMySQL = async (
	credentials: MysqlCredentials,
	mysqlSchema: Record<string, Record<string, AnyMySqlTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { connectToMySQL } = await import('../cli/connections');
	const { proxy, transactionProxy, database, packageName } = await connectToMySQL(credentials);

	const customDefaults = getCustomDefaults(mysqlSchema, casing);

	let dbUrl: string;

	if ('url' in credentials) {
		dbUrl = credentials.url;
	} else {
		dbUrl =
			`mysql://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
	}

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'mysql',
		packageName,
		databaseName: database,
		proxy,
		transactionProxy,
		customDefaults,
		schema: mysqlSchema,
		relations,
		schemaFiles,
		casing,
	};
};

export const drizzleForSQLite = async (
	credentials: SqliteCredentials,
	sqliteSchema: Record<string, Record<string, AnySQLiteTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { connectToSQLite } = await import('../cli/connections');

	const sqliteDB = await connectToSQLite(credentials);
	const customDefaults = getCustomDefaults(sqliteSchema, casing);

	let dbUrl: string;

	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'd1-http') {
			dbUrl = `d1-http://${credentials.accountId}/${credentials.databaseId}/${credentials.token}`;
		} else {
			assertUnreachable(driver);
		}
	} else {
		dbUrl = credentials.url;
	}

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'sqlite',
		driver: 'driver' in credentials ? credentials.driver : undefined,
		packageName: sqliteDB.packageName,
		proxy: sqliteDB.proxy,
		transactionProxy: sqliteDB.transactionProxy,
		customDefaults,
		schema: sqliteSchema,
		relations,
		schemaFiles,
		casing,
	};
};
export const drizzleForLibSQL = async (
	credentials: LibSQLCredentials,
	sqliteSchema: Record<string, Record<string, AnySQLiteTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { connectToLibSQL } = await import('../cli/connections');

	const sqliteDB = await connectToLibSQL(credentials);
	const customDefaults = getCustomDefaults(sqliteSchema, casing);

	let dbUrl: string = `turso://${credentials.url}/${credentials.authToken}`;

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'sqlite',
		driver: undefined,
		packageName: sqliteDB.packageName,
		proxy: sqliteDB.proxy,
		transactionProxy: sqliteDB.transactionProxy,
		customDefaults,
		schema: sqliteSchema,
		relations,
		schemaFiles,
		casing,
	};
};

export const drizzleForSingleStore = async (
	credentials: SingleStoreCredentials,
	singlestoreSchema: Record<string, Record<string, AnySingleStoreTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { connectToSingleStore } = await import('../cli/connections');
	const { proxy, transactionProxy, database, packageName } = await connectToSingleStore(credentials);

	const customDefaults = getCustomDefaults(singlestoreSchema, casing);

	let dbUrl: string;

	if ('url' in credentials) {
		dbUrl = credentials.url;
	} else {
		dbUrl =
			`singlestore://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.database}`;
	}

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'singlestore',
		databaseName: database,
		packageName,
		proxy,
		transactionProxy,
		customDefaults,
		schema: singlestoreSchema,
		relations,
		schemaFiles,
		casing,
	};
};

type Relation = {
	name: string;
	type: 'one' | 'many';
	table: string;
	schema: string;
	columns: string[];
	refTable: string;
	refSchema: string;
	refColumns: string[];
};

export const extractRelations = (
	tablesConfig: {
		tables: TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
	},
	casing?: CasingType,
): Relation[] => {
	const relations = Object.values(tablesConfig.tables)
		.map((it) =>
			Object.entries(it.relations).map(([name, relation]) => {
				try {
					const normalized = normalizeRelation(
						tablesConfig.tables,
						tablesConfig.tableNamesMap,
						relation,
					);
					const rel = relation;
					const refTableName = rel.referencedTableName;
					const refTable = rel.referencedTable;
					const fields = normalized.fields
						.map((it) => getColumnCasing(it, casing))
						.flat();
					const refColumns = normalized.references
						.map((it) => getColumnCasing(it, casing))
						.flat();

					let refSchema: string | undefined;
					if (is(refTable, PgTable)) {
						refSchema = pgTableConfig(refTable).schema;
					} else if (is(refTable, MySqlTable)) {
						refSchema = mysqlTableConfig(refTable).schema;
					} else if (is(refTable, SQLiteTable)) {
						refSchema = undefined;
					} else if (is(refTable, SingleStoreTable)) {
						refSchema = singlestoreTableConfig(refTable).schema;
					} else {
						throw new Error('unsupported dialect');
					}

					let type: 'one' | 'many';
					if (is(rel, One)) {
						type = 'one';
					} else if (is(rel, Many)) {
						type = 'many';
					} else {
						throw new Error('unsupported relation type');
					}

					return {
						name,
						type,
						table: it.dbName,
						schema: it.schema || 'public',
						columns: fields,
						refTable: refTableName,
						refSchema: refSchema || 'public',
						refColumns: refColumns,
					};
				} catch (error) {
					throw new Error(
						`Invalid relation "${relation.fieldName}" for table "${
							it.schema ? `${it.schema}.${it.dbName}` : it.dbName
						}"`,
					);
				}
			})
		)
		.flat();
	return relations;
};

const init = z.object({
	type: z.literal('init'),
});

const proxySchema = z.object({
	type: z.literal('proxy'),
	data: z.object({
		sql: z.string(),
		params: z.array(z.any()).optional(),
		typings: z.string().array().optional(),
		mode: z.enum(['array', 'object']).default('object'),
		method: z.union([
			z.literal('values'),
			z.literal('get'),
			z.literal('all'),
			z.literal('run'),
			z.literal('execute'),
		]),
	}),
});

const transactionProxySchema = z.object({
	type: z.literal('tproxy'),
	data: z
		.object({
			sql: z.string(),
			method: z
				.union([
					z.literal('values'),
					z.literal('get'),
					z.literal('all'),
					z.literal('run'),
					z.literal('execute'),
				])
				.optional(),
		})
		.array(),
});

const defaultsSchema = z.object({
	type: z.literal('defaults'),
	data: z
		.array(
			z.object({
				schema: z.string(),
				table: z.string(),
				column: z.string(),
			}),
		)
		.min(1),
});

const schema = z.union([
	init,
	proxySchema,
	transactionProxySchema,
	defaultsSchema,
]);

const jsonStringify = (data: any) => {
	return JSON.stringify(data, (_key, value) => {
		// Convert Error to object
		if (value instanceof Error) {
			return {
				error: value.message,
			};
		}

		// Convert BigInt to string
		if (typeof value === 'bigint') {
			return value.toString();
		}

		// Convert Buffer and ArrayBuffer to base64
		if (
			(value
				&& typeof value === 'object'
				&& 'type' in value
				&& 'data' in value
				&& value.type === 'Buffer')
			|| value instanceof ArrayBuffer
			|| value instanceof Buffer
		) {
			return Buffer.from(value).toString('base64');
		}

		return value;
	});
};

export type Server = {
	start: (params: {
		host: string;
		port: number;
		key?: string;
		cert?: string;
		cb: (err: Error | null, address: string) => void;
	}) => void;
};

export const prepareServer = async (
	{
		dialect,
		driver,
		packageName,
		databaseName,
		proxy,
		transactionProxy,
		customDefaults,
		schema: drizzleSchema,
		relations,
		dbHash,
		casing,
		schemaFiles,
	}: Setup,
	app?: Hono,
): Promise<Server> => {
	app = app !== undefined ? app : new Hono();

	app.use(compress());
	app.use(async (ctx, next) => {
		await next();
		// * https://wicg.github.io/private-network-access/#headers
		// * https://github.com/drizzle-team/drizzle-orm/issues/1857#issuecomment-2395724232
		ctx.header('Access-Control-Allow-Private-Network', 'true');
	});
	app.use(cors());
	app.onError((err, ctx) => {
		console.error(err);
		return ctx.json({
			status: 'error',
			error: err.message,
		});
	});

	const relationalSchema: Record<string, unknown> = {
		...Object.fromEntries(
			Object.entries(drizzleSchema)
				.map(([schemaName, schema]) => {
					// have unique keys across schemas
					const mappedTableEntries = Object.entries(schema).map(
						([tableName, table]) => {
							return [`__${schemaName}__.${tableName}`, table];
						},
					);

					return mappedTableEntries;
				})
				.flat(),
		),
		...relations,
	};

	const relationsConfig = extractTablesRelationalConfig(
		relationalSchema,
		createTableRelationsHelpers,
	);

	app.post('/', zValidator('json', schema), async (c) => {
		const body = c.req.valid('json');
		const { type } = body;

		if (type === 'init') {
			const preparedDefaults = customDefaults.map((d) => ({
				schema: d.schema,
				table: d.table,
				column: d.column,
			}));

			let relations: Relation[] = [];
			// Attempt to extract relations from the relational config.
			// An error may occur if the relations are ambiguous or misconfigured.
			try {
				relations = extractRelations(relationsConfig, casing);
			} catch (error) {
				console.warn(
					'Failed to extract relations. This is likely due to ambiguous or misconfigured relations.',
				);
				console.warn(
					'Please check your schema and ensure that all relations are correctly defined.',
				);
				console.warn(
					'See: https://orm.drizzle.team/docs/relations#disambiguating-relations',
				);
				console.warn('Error message:', (error as Error).message);
			}

			return c.json({
				version: '6.2',
				dialect,
				driver,
				packageName,
				schemaFiles,
				customDefaults: preparedDefaults,
				relations,
				dbHash,
				databaseName,
			});
		}

		if (type === 'proxy') {
			const result = await proxy({
				...body.data,
				params: body.data.params || [],
			});
			return c.json(JSON.parse(jsonStringify(result)));
		}

		if (type === 'tproxy') {
			const result = await transactionProxy(body.data);
			return c.json(JSON.parse(jsonStringify(result)));
		}

		if (type === 'defaults') {
			const columns = body.data;

			const result = columns.map((column) => {
				const found = customDefaults.find((d) => {
					return (
						d.schema === column.schema
						&& d.table === column.table
						&& d.column === column.column
					);
				});

				if (!found) {
					throw new Error(
						`Custom default not found for ${column.schema}.${column.table}.${column.column}`,
					);
				}

				const value = found.func();

				return {
					...column,
					value,
				};
			});

			return c.json(JSON.parse(jsonStringify(result)));
		}

		throw new Error(`Unknown type: ${type}`);
	});

	return {
		start: (params: Parameters<Server['start']>[0]) => {
			serve(
				{
					fetch: app!.fetch,
					createServer: params.key ? createServer : undefined,
					hostname: params.host,
					port: params.port,
					serverOptions: {
						key: params.key,
						cert: params.cert,
					},
				},
				() => params.cb(null, `${params.host}:${params.port}`),
			);
		},
	};
};
