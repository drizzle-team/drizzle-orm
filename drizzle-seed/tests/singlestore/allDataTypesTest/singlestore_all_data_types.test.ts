import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { seed } from '../../../src/index.ts';
import { singlestoreTest as test } from '../instrumentation.ts';

import * as schema from './singlestoreSchema.ts';

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

		resolveFunc('');
	}

	await promise;
});

test('basic seed test', async ({ db }) => {
	await seed(db, schema, { count: 1 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each 10 rows does not equal undefined.
	const predicate = allDataTypes.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));

	expect(predicate).toBe(true);
});
