export const dialects = [
	'cockroach',
	'gel',
	'mssql',
	'mysql',
	'pg',
	'singlestore',
	'sqlite',
];

export const drivers = [
	'aws-data-api/pg',
	'better-sqlite3',
	'bun-sql',
	'bun-sql/mysql',
	'bun-sql/postgres',
	'bun-sql/sqlite',
	'bun-sqlite',
	'cockroach',
	'd1',
	'durable-sqlite',
	'expo-sqlite',
	'gel',
	'libsql',
	'mysql-proxy',
	'mysql2',
	'neon-http',
	'neon-serverless',
	'node-mssql',
	'node-postgres',
	'op-sqlite',
	'pg-proxy',
	'pglite',
	'planetscale-serverless',
	'postgres-js',
	'singlestore',
	'singlestore-proxy',
	'sql-js',
	'sqlite-proxy',
	'tidb-serverless',
	'tursodatabase',
	'vercel-postgres',
	'xata-http',
];

export const misc = [
	'cache/core',
	'cache/upstash',
	'libsql/http',
	'libsql/node',
	'libsql/sqlite3',
	'libsql/wasm',
	'libsql/web',
	'libsql/ws',
	'neon',
	'prisma/mysql',
	'prisma/pg',
	'prisma/sqlite',
	'supabase',
];

export const entrypoints = {
	index: 'src/index.ts',
	_relations: 'src/_relations.ts',
	relations: 'src/relations.ts',
	migrator: 'src/migrator.ts',
	version: 'src/version.ts',
	casing: 'src/casing.ts',
	'cache/core/types': 'src/cache/core/types.ts',
	'tursodatabase/database': 'src/tursodatabase/database.ts',
	...dialects.reduce((acc, dialect) => {
		acc[`${dialect}-core/index`] = `src/${dialect}-core/index.ts`;
		acc[`${dialect}-core/expressions`] = `src/${dialect}-core/expressions.ts`;
		return acc;
	}, {} as Record<string, string>),
	...drivers.reduce((acc, driver) => {
		acc[`${driver}/index`] = `src/${driver}/index.ts`;
		acc[`${driver}/migrator`] = `src/${driver}/migrator.ts`;
		return acc;
	}, {} as Record<string, string>),
	...misc.reduce((acc, item) => {
		acc[`${item}/index`] = `src/${item}/index.ts`;
		return acc;
	}, {} as Record<string, string>),
};
