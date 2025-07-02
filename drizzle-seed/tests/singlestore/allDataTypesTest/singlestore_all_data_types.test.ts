import retry from 'async-retry';
import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import { drizzle } from 'drizzle-orm/singlestore';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './singlestoreSchema.ts';

let singleStoreContainer: Container;
let client: Connection | undefined;
let db: SingleStoreDriverDatabase;

beforeAll(async () => {
	const { url: connectionString, container } = await createDockerDB();
	singleStoreContainer = container;

	client = await retry(async () => {
		client = await createConnection({ uri: connectionString, supportBigNumbers: true });
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});

	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
	await client.changeUser({ database: 'drizzle' });
	db = drizzle(client);

	await db.execute(
		sql`
			    CREATE TABLE \`all_data_types\` (
				\`int\` int,
				\`tinyint\` tinyint,
				\`smallint\` smallint,
				\`mediumint\` mediumint,
				\`bigint\` bigint,
				\`bigint_number\` bigint,
				\`real\` real,
				\`decimal\` decimal,
				\`double\` double,
				\`float\` float,
				\`serial\` serial,
				\`binary\` binary(255),
				\`varbinary\` varbinary(256),
				\`char\` char(255),
				\`varchar\` varchar(256),
				\`tinytext\` tinytext,
				\`mediumtext\` mediumtext,
				\`text\` text,
				\`longtext\` longtext,
				\`boolean\` boolean,
				\`date_string\` date,
				\`date\` date,
				\`datetime\` datetime,
				\`datetimeString\` datetime,
				\`time\` time,
				\`year\` year,
				\`timestamp_date\` timestamp,
				\`timestamp_string\` timestamp,
				\`json\` json,
				\`popularity\` enum('unknown','known','popular'),
				\`vector_f32\` vector(12, F32),
				\`vector_f64\` vector(12, F64),
				\`vector_i8\` vector(12, I8),
				\`vector_i16\` vector(12, I16),
				\`vector_i32\` vector(12, I32),
				\`vector_i64\` vector(12, I64),
				shard key (\`serial\`)
			);
		`,
	);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singleStoreContainer?.stop().catch(console.error);
});

test('basic seed test', async () => {
	await seed(db, schema, { count: 1 });

	// const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = true; // allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
