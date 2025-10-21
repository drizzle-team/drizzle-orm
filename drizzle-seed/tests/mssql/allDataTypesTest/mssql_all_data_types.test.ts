import { sql } from 'drizzle-orm';

import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';

import type { Container } from 'dockerode';
import type { MsSqlDatabase } from 'drizzle-orm/node-mssql';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './mssqlSchema.ts';

let mssqlContainer: Container;
let client: mssql.ConnectionPool;
let db: MsSqlDatabase<any, any>;

beforeAll(async () => {
	const { options, container } = await createDockerDB('all_data_types');
	mssqlContainer = container;

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mssql.connect(options);
			await client.connect();
			db = drizzle({ client });
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
		await mssqlContainer?.stop().catch(console.error);
		throw lastError;
	}

	await db.execute(
		sql`
				CREATE TABLE [all_data_types] (
				[integer] int,
				[tinyint] tinyint,
				[smallint] smallint,
				[bigint] bigint,
				[bigint_number] bigint,
				[real] real,
				[decimal] decimal,
				[numeric] numeric,
				[float] float,
				[binary] binary(5),
				[varbinary] varbinary(5),
				[char] char(5),
				[varchar] varchar(5),
				[text] text,
				[bit] bit,
				[date_string] date,
				[date] date,
				[datetime] datetime,
				[datetime_string] datetime,
				[datetime2] datetime2,
				[datetime2_string] datetime2,
				[datetime_offset] datetimeoffset,
				[datetime_offset_string] datetimeoffset,
				[time] time
			);
		`,
	);
});

afterAll(async () => {
	await client?.close().catch(console.error);
	await mssqlContainer?.stop().catch(console.error);
});

afterEach(async () => {
	await reset(db, schema);
});

test('basic seed test', async () => {
	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
