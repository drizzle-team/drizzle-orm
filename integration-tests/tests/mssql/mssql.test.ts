import type Docker from 'dockerode';
import { DefaultLogger } from 'drizzle-orm';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import type { ConnectionPool } from 'mssql';
import mssql from 'mssql';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createDockerDB, tests } from './mssql-common';

const ENABLE_LOGGING = false;

let db: NodeMsSqlDatabase;
let client: ConnectionPool;
let container: Docker.Container | undefined;

beforeAll(async () => {
	let connectionString;
	if (process.env['MSSQL_CONNECTION_STRING']) {
		connectionString = process.env['MSSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
		connectionString = conStr;
		container = contrainerObj;
	}

	const sleep = 2000;
	let timeLeft = 30000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mssql.connect(connectionString);
			client.on('debug', console.log);
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MsSQL');
		await client?.close().catch(console.error);
		await container?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle(client, { logger: ENABLE_LOGGING ? new DefaultLogger() : undefined });
});

afterAll(async () => {
	await client?.close();
	await container?.stop().catch(console.error);
});

beforeEach((ctx) => {
	ctx.mssql = {
		db,
	};
});

tests();
