import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import * as schema from './mysqlSchema.ts';

let mysqlContainer: Docker.Container;
let client: Connection;
let db: MySql2Database;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

beforeAll(async () => {
	const connectionString = await createDockerDB();

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await createConnection(connectionString);
			await client.connect();
			db = drizzle(client);
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MySQL');
		await client?.end().catch(console.error);
		await mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}

	await db.execute(
		sql`
			    CREATE TABLE \`datetime_table\` (
				\`datetime\` datetime
			);
		`,
	);

	await db.execute(
		sql`
			    CREATE TABLE \`year_table\` (
				\`year\` year
			);
		`,
	);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await mysqlContainer?.stop().catch(console.error);
});

const count = 10000;

test.only('datetime generator test', async () => {
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime(),
			},
		},
	}));

	let data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	let predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	const minDatetime = '2025-03-07 13:12:13Z';
	const maxDatetime = '2025-03-09 15:12:13Z';
	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					minDatetime,
					maxDatetime,
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) =>
				val !== null && val >= new Date(minDatetime)
				&& val <= new Date(maxDatetime)
			)
		);

	expect(predicate).toBe(true);

	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					minDatetime,
					maxDatetime: minDatetime,
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(minDatetime).getTime())
		);

	expect(predicate).toBe(true);

	await reset(db, { datetimeTable: schema.datetimeTable });
	await seed(db, { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count,
			columns: {
				datetime: funcs.datetime({
					minDatetime: new Date(minDatetime),
					maxDatetime: new Date(minDatetime),
				}),
			},
		},
	}));

	data = await db.select().from(schema.datetimeTable);
	// every value in each row does not equal undefined.
	predicate = data.length !== 0
		&& data.every((row) =>
			Object.values(row).every((val) => val !== null && val.getTime() === new Date(minDatetime).getTime())
		);

	expect(predicate).toBe(true);
});

test('year generator test', async () => {
	await seed(db, { yearTable: schema.yearTable }).refine((funcs) => ({
		yearTable: {
			count,
			columns: {
				year: funcs.year(),
			},
		},
	}));

	const data = await db.select().from(schema.yearTable);
	// every value in each row does not equal undefined.
	const predicate = data.length !== 0
		&& data.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
