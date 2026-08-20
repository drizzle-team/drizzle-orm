import 'dotenv/config';
import { PGlite as pglite } from '@electric-sql/pglite';
import { createClient as libsql } from '@libsql/client';
import { Client as neonClient, neon, neonConfig, Pool as neonPool } from '@neondatabase/serverless';
import { connect as planetscale } from '@planetscale/database';
import { connect as tidb } from '@tidbcloud/serverless';
import { createClient as vcClient, sql as vcSql } from '@vercel/postgres';
import betterSqlite3 from 'better-sqlite3';
import { type DrizzleConfig, isConfig } from 'drizzle-orm';
import { createConnection as ms2Connection, createPool as ms2Pool } from 'mysql2';
import { createConnection as ms2pConnection, createPool as ms2pPool } from 'mysql2/promise';
import pg from 'pg';
import postgres from 'postgres';
import { describe, expect } from 'vitest';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

if (
	!process.env['PG_CONNECTION_STRING'] || !process.env['MYSQL_CONNECTION_STRING']
	|| !process.env['PLANETSCALE_CONNECTION_STRING'] || !process.env['TIDB_CONNECTION_STRING']
	|| !process.env['NEON_CONNECTION_STRING']
	// todo get back after we will have a pool for vercel
	// || !process.env['VERCEL_CONNECTION_STRING']
) {
	throw new Error('process.env is missing some connection strings!');
}

// process.env['POSTGRES_URL'] = process.env['VERCEL_CONNECTION_STRING'];

describe('Objects', (it) => {
	it('Passes configs', () => {
		expect(isConfig({} as DrizzleConfig)).toEqual(true);

		expect(
			isConfig({
				casing: 'camelCase',
			} as DrizzleConfig),
		).toEqual(true);

		expect(
			isConfig({
				logger: true,
			} as DrizzleConfig),
		).toEqual(true);

		expect(
			isConfig({
				logger: {
					logQuery: () => {},
				},
			} as DrizzleConfig),
		).toEqual(true);

		expect(
			isConfig({
				schema: {
					any: true,
				},
			} as DrizzleConfig<any>),
		).toEqual(true);

		expect(
			isConfig({
				casing: 'camelCase',
				logger: true,
				schema: {
					any: true,
				},
			} as DrizzleConfig<any>),
		).toEqual(true);

		expect(
			isConfig({
				casing: 'camelCase',
				trash: true,
			} as DrizzleConfig),
		).toEqual(true);
	});

	it('Rejects non-configs', () => {
		expect(isConfig('')).toEqual(false);

		expect(isConfig('data')).toEqual(false);

		expect(isConfig(true)).toEqual(false);

		expect(isConfig(false)).toEqual(false);

		expect(isConfig(null)).toEqual(false);

		expect(isConfig(undefined)).toEqual(false);

		expect(isConfig(5)).toEqual(false);

		expect(isConfig(BigInt(5))).toEqual(false);

		expect(isConfig(new Date())).toEqual(false);

		expect(
			isConfig({
				trash: true,
			} as DrizzleConfig),
		).toEqual(false);
	});
});

describe('Rejects drivers', (it) => {
	it('libsql', () => {
		const cl = libsql({
			url: ':memory:',
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('better-sqlite3', () => {
		const cl = new betterSqlite3(':memory:');

		expect(isConfig(cl)).toEqual(false);
	});

	it('pglite', () => {
		const cl = new pglite('memory://');

		expect(isConfig(cl)).toEqual(false);
	});

	it('node-postgres:Pool', () => {
		const cl = new pg.Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('node-postgres:Client', async () => {
		const cl = new pg.Client({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		const res = isConfig(cl);

		await cl.end();

		expect(res).toEqual(false);
	});

	it('node-postgres:PoolClient', async () => {
		const cl = new pg.Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		const con = await cl.connect();

		const res = isConfig(con);

		con.release();

		expect(res).toEqual(false);
	});

	it('postgres-js', () => {
		const cl = postgres(process.env['PG_CONNECTION_STRING']!);

		expect(isConfig(cl)).toEqual(false);
	});

	it('vercel:sql', () => {
		expect(isConfig(vcSql)).toEqual(false);
	});

	// it('vercel:Pool', () => {
	// 	const cl = vcPool({
	// 		connectionString: process.env['VERCEL_CONNECTION_STRING'],
	// 	});

	// 	expect(isConfig(cl)).toEqual(false);
	// });

	it('vercel:Client', async () => {
		const cl = vcClient({
			connectionString: process.env['NEON_CONNECTION_STRING']?.replace('-pooler', ''),
		});

		const res = isConfig(cl);

		expect(res).toEqual(false);
	});

	// it('vercel:PoolClient', async () => {
	// 	const cl = vcPool({
	// 		connectionString: process.env['VERCEL_CONNECTION_STRING'],
	// 	});

	// 	const con = await cl.connect();

	// 	const res = isConfig(con);

	// 	con.release();

	// 	expect(res).toEqual(false);
	// });

	it('neon-serverless:Pool', async () => {
		const cl = new neonPool({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('neon-serverless:Client', async () => {
		const cl = new neonClient({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		const res = isConfig(cl);

		await cl.end();

		expect(res).toEqual(false);
	});

	it('neon-serverless:PoolClient', async () => {
		const cl = new neonPool({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		const con = await cl.connect();

		const res = isConfig(con);

		con.release();

		expect(res).toEqual(false);
	});

	it('neon-http', async () => {
		const cl = neon(process.env['NEON_CONNECTION_STRING']!);

		expect(isConfig(cl)).toEqual(false);
	});

	it('planetscale', async () => {
		const cl = planetscale({
			url: process.env['PLANETSCALE_CONNECTION_STRING'],
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('mysql2:Pool', async () => {
		const cl = ms2Pool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('mysql2:Connection', async () => {
		const cl = ms2Connection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		expect(isConfig(cl)).toEqual(false);
	});

	it('mysql2/promise:Pool', async () => {
		const cl = await ms2pPool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const res = isConfig(cl);

		await cl.end();

		expect(res).toEqual(false);
	});

	it('mysql2/promise:Connection', async () => {
		const cl = await ms2pConnection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const res = isConfig(cl);

		await cl.end();

		expect(res).toEqual(false);
	});

	it('tidb', async () => {
		const cl = tidb({
			url: process.env['TIDB_CONNECTION_STRING'],
		});

		expect(isConfig(cl)).toEqual(false);
	});
});

describe('Accepts drivers in .client', (it) => {
	it('libsql', () => {
		const cl = libsql({
			url: ':memory:',
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('better-sqlite3', () => {
		const cl = new betterSqlite3(':memory:');

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('pglite', () => {
		const cl = new pglite('memory://');

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('node-postgres:Pool', () => {
		const cl = new pg.Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('node-postgres:Client', async () => {
		const cl = new pg.Client({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		const res = isConfig({ client: cl });

		await cl.end();

		expect(res).toEqual(true);
	});

	it('node-postgres:PoolClient', async () => {
		const cl = new pg.Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});

		const con = await cl.connect();

		const res = isConfig({ client: con });

		con.release();

		expect(res).toEqual(true);
	});

	it('postgres-js', () => {
		const cl = postgres(process.env['PG_CONNECTION_STRING']!);

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('vercel:sql', () => {
		expect(isConfig({ client: vcSql })).toEqual(true);
	});

	// it('vercel:Pool', () => {
	// 	const cl = vcPool({
	// 		connectionString: process.env['VERCEL_CONNECTION_STRING'],
	// 	});

	// 	expect(isConfig({client:cl})).toEqual(true);
	// });

	it('vercel:Client', async () => {
		const cl = vcClient({
			connectionString: process.env['NEON_CONNECTION_STRING']?.replace('-pooler', ''),
		});

		const res = isConfig({ client: cl });

		expect(res).toEqual(true);
	});

	// it('vercel:PoolClient', async () => {
	// 	const cl = vcPool({
	// 		connectionString: process.env['VERCEL_CONNECTION_STRING'],
	// 	});

	// 	const con = await cl.connect();

	// 	const res = isConfig({ client: con });

	// 	con.release();

	// 	expect(res).toEqual(true);
	// });

	it('neon-serverless:Pool', async () => {
		const cl = new neonPool({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('neon-serverless:Client', async () => {
		const cl = new neonClient({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		const res = isConfig({ client: cl });

		await cl.end();

		expect(res).toEqual(true);
	});

	it('neon-serverless:PoolClient', async () => {
		const cl = new neonPool({
			connectionString: process.env['NEON_CONNECTION_STRING']!,
		});

		const con = await cl.connect();

		const res = isConfig({ client: con });

		con.release();

		expect(res).toEqual(true);
	});

	it('neon-http', async () => {
		const cl = neon(process.env['NEON_CONNECTION_STRING']!);

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('planetscale', async () => {
		const cl = planetscale({
			url: process.env['PLANETSCALE_CONNECTION_STRING'],
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('mysql2:Pool', async () => {
		const cl = ms2Pool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('mysql2:Connection', async () => {
		const cl = ms2Connection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});

	it('mysql2/promise:Pool', async () => {
		const cl = await ms2pPool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const res = isConfig({ client: cl });

		await cl.end();

		expect(res).toEqual(true);
	});

	it('mysql2/promise:Connection', async () => {
		const cl = await ms2pConnection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const res = isConfig({ client: cl });

		await cl.end();

		expect(res).toEqual(true);
	});

	it('tidb', async () => {
		const cl = tidb({
			url: process.env['TIDB_CONNECTION_STRING'],
		});

		expect(isConfig({ client: cl })).toEqual(true);
	});
});
