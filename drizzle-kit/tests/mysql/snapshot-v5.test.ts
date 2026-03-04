import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diffSnapshotV5, prepareTestDatabase, TestDatabase } from './mocks';
import * as s01old from './snapshots/schema01';
import * as s01 from './snapshots/schema01new';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

// TODO
// author: @AlexSherman
// @AlexBlokh - I have added new fields in ddl. Just in case ping you
test('s01', async (t) => {
	const res = await diffSnapshotV5(db, s01, s01old);

	// previous kit did generate `default '10.123'` for decimals which results in introspected '10' trimmed value
	expect(res.all).toStrictEqual([
		'ALTER TABLE `all_data_types` MODIFY COLUMN `decimal` decimal DEFAULT (10.123);',
		'ALTER TABLE `all_data_types` MODIFY COLUMN `decimal_precision` decimal(6) DEFAULT (10.123);',
		'ALTER TABLE `all_data_types` MODIFY COLUMN `decimal_precision_scale` decimal(6,2) DEFAULT (10.123);',
	]);
});
