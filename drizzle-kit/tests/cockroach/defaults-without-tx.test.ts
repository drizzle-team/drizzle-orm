import { sql } from 'drizzle-orm';
import {
	bigint,
	bit,
	bool,
	char,
	cockroachEnum,
	date,
	decimal,
	doublePrecision,
	float,
	geometry,
	inet,
	int4,
	int8,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uuid,
	varchar,
	vector,
} from 'drizzle-orm/cockroach-core';
import { varbit } from 'drizzle-orm/cockroach-core/columns/varbit';
import { DB } from 'src/utils';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { diffDefault, prepareTestDatabase, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	// TODO can be improved
	// these tests are failing when using "tx" in prepareTestDatabase
	_ = await prepareTestDatabase(false);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

test('char + char arrays', async () => {
	const res1_0 = await diffDefault(_, char().default('text'), `'text'`, true);
	// char is less than default
	const res10 = await diffDefault(_, char({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res1_0).toStrictEqual([`Insert default failed`]);
	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});

test('varchar + varchar arrays', async () => {
	// varchar length is less than default
	const res10 = await diffDefault(_, varchar({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});

test('string + string arrays', async () => {
	// varchar length is less than default
	const res10 = await diffDefault(_, string({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});
