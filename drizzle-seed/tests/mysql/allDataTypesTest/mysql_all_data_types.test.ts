import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';
import * as schema from './mysqlSchema.ts';

let mysqlContainer: Docker.Container;
let client: Connection | undefined;
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
			const client = await createConnection(connectionString);
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
			    CREATE TABLE \`all_data_types\` (
				\`integer\` int,
				\`tinyint\` tinyint,
				\`smallint\` smallint,
				\`mediumint\` mediumint,
				\`bigint\` bigint,
				\`bigint_number\` bigint,
				\`real\` real,
				\`decimal\` decimal,
				\`double\` double,
				\`float\` float,
				\`serial\` serial AUTO_INCREMENT,
				\`binary\` binary(255),
				\`varbinary\` varbinary(256),
				\`char\` char(255),
				\`varchar\` varchar(256),
				\`text\` text,
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
				\`popularity\` enum('unknown','known','popular')
			);
		`,
	);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await mysqlContainer?.stop().catch(console.error);
});

test('basic seed test', async () => {
	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
