import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { seed } from '../../../src/index.ts';
import { mysqlTest as test } from '../instrumentation.ts';
import * as schema from './mysqlSchema.ts';

let firstTime = true;
let resolveFunc: (val: any) => void;
const promise = new Promise((resolve) => {
	resolveFunc = resolve;
});
test.beforeEach(async ({ db }) => {
	if (firstTime) {
		firstTime = false;

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

		resolveFunc('');
	}

	await promise;
});

test('basic seed test', async ({ db }) => {
	await seed(db, schema, { count: 10000 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
