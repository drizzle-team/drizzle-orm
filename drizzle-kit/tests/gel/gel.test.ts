import fs from 'fs';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import 'zx/globals';
import { DB } from 'src/utils';
import { prepareTestDatabase, pull, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

const ENABLE_LOGGING = false;
const tlsSecurity = 'insecure';

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase(ENABLE_LOGGING, tlsSecurity);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

fs.mkdirSync('tests/gel/tmp', { recursive: true });
$.quiet = true;

test('basic introspect test', async () => {
	await $`pnpm gel query 'CREATE TYPE default::all_columns {

		create property stringColumn: str;
		create required property requiredStringColumn: str;
		create required property arrayRequiredStringColumn: array<str>;
		create property defaultStringColumn: str {
			SET DEFAULT := "name";
		};

		create property boolColumn:bool;
		create required property requiredBoolColumn: bool;
		create required property arrayRequiredBoolColumn: array<bool>;
		create property defaultBoolColumn: bool {
			SET DEFAULT := true;
		};

		create property int16Column:int16;
		create required property requiredint16Column: int16;
		create required property arrayRequiredint16Column: array<int16>;
		create property defaultint16Column: int16 {
			SET DEFAULT := 123;
		};

		create property int32Column:int32;
		create required property requiredint32Column: int32;
		create required property arrayRequiredint32Column: array<int32>;
		create property defaultint32Column: int32 {
			SET DEFAULT := 123;
		};

		create property int64Column:int64;
		create required property requiredint64Column: int64;
		create required property arrayRequiredint64Column: array<int64>;
		create property defaultint64Column: int64 {
			SET DEFAULT := 123;
		};

		create property float32Column:float32;
		create required property requiredfloat32Column: float32;
		create required property arrayRequiredfloat32Column: array<float32>;
		create property defaultfloat32Column: float32 {
			SET DEFAULT := 123.123;
		};

		create property float64Column:float64;
		create required property requiredfloat64Column: float64;
		create required property arrayRequiredfloat64Column: array<float64>;
		create property defaultfloat64Column: float64 {
			SET DEFAULT := 123.123;
		};

		create property bigintColumn:bigint;
		create required property requiredbigintColumn: bigint;
		create required property arrayRequiredbigintColumn: array<bigint>;
		create property defaultbigintColumn: bigint {
			SET DEFAULT := 123n;
		};

		create property decimalColumn:decimal;
		create required property requireddecimalColumn: decimal;
		create required property arrayRequireddecimalColumn: array<decimal>;
		create property defaultdecimalColumn: decimal {
			SET DEFAULT := 1.23n;
		};

		create property uuidColumn:uuid;
		create required property requireduuidColumn: uuid;
		create required property arrayRequireduuidColumn: array<uuid>;
		create property defaultuuidColumn: uuid {
			SET DEFAULT := uuid_generate_v4();
		};

		create property jsonColumn:json;
		create required property requiredjsonColumn: json;
		create required property arrayRequiredjsonColumn: array<json>;
		create property defaultjsonColumn: json {
			SET DEFAULT := <json>[1, 2];
		};

		create property datetimeColumn:datetime;
		create required property requireddatetimeColumn: datetime;
		create required property arrayRequireddatetimeColumn: array<datetime>;
		create property defaultdatetimeColumn: datetime {
			SET DEFAULT := <std::datetime>"2018-05-07T15:01:22.306916+00";
		};

		create property local_datetimeColumn:cal::local_datetime;
		create required property requiredlocal_datetimeColumn: cal::local_datetime;
		create required property arrayRequiredlocal_datetimeColumn: array<cal::local_datetime>;
		create property defaultlocal_datetimeColumn: cal::local_datetime {
			SET DEFAULT := <cal::local_datetime>"2018-05-07T15:01:22.306916";
		};

		create property local_dateColumn:cal::local_date;
		create required property requiredlocal_dateColumn: cal::local_date;
		create required property arrayRequiredlocal_dateColumn: array<cal::local_date>;
		create property defaultlocal_dateColumn: cal::local_date {
			SET DEFAULT := <cal::local_date>"2018-05-07";
		};

		create property local_timeColumn:cal::local_time;
		create required property requiredlocal_timeColumn: cal::local_time;
		create required property arrayRequiredlocal_timeColumn: array<cal::local_time>;
		create property defaultlocal_timeColumn: cal::local_time {
			SET DEFAULT := <cal::local_time>"15:01:22.306916";
		};

		create property durationColumn:duration;
		create required property requireddurationColumn: duration;
		create required property arrayRequireddurationColumn: array<duration>;
		create property defaultdurationColumn: duration {
			SET DEFAULT := <duration>"45.6 seconds";
		};

		create property relative_durationColumn:cal::relative_duration;
		create required property requiredrelative_durationColumn: cal::relative_duration;
		create required property arrayRequiredrelative_durationColumn: array<cal::relative_duration>;
		create property defaultrelative_durationColumn: cal::relative_duration {
			SET DEFAULT := <cal::relative_duration>"1 year";
		};

		create property dateDurationColumn:cal::date_duration;
		create required property requireddate_durationColumn: cal::date_duration;
		create required property arrayRequireddate_durationColumn: array<cal::date_duration>;
		create property defaultdate_durationColumn: cal::date_duration {
			SET DEFAULT := <cal::date_duration>"5 days";
		};

		create property bytesColumn:bytes;
		create required property requiredbytesColumn:bytes;
		create required property arrayRequiredbytesColumn: array<bytes>;
		create property defaultbytesColumn: bytes {
			SET DEFAULT := b"Hello, world";
		};
	}' --tls-security=${tlsSecurity} --dsn=${_.url}`;

	const path = await pull(db, 'basic-introspect');

	const result = await $`pnpm exec tsc --noEmit --skipLibCheck ${path}`.nothrow(true);
	expect(result.exitCode).toBe(0);
	fs.rmSync(path);
});
