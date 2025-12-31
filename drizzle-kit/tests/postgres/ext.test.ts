import { introspect } from 'src/cli/commands/pull-postgres';
import { EmptyProgressView } from 'src/cli/views';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, test } from 'vitest';
import { prepareTestDatabase, TestDatabase } from './mocks';

let _: TestDatabase;
let db: DB;

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

test('ext:1', async () => {
	await db.query(
		/*sql*/
		`create table "t" (
      "predict" json default '{"key":"value"}', 
      "prediction" json generated always as (predict->'predictions') stored
    );`,
	);

	const res = await introspect(db, () => true, new EmptyProgressView(), () => {}, {
		schema: 'drizzle',
		table: 'drizzle_migrations',
	});
});

test('ext:2', async () => {
	await db.query(
		/*sql*/
		`create table "t" (
      c1 int not null, 
      c2 int not null,
      PRIMARY KEY (c1, c2)
    );`,
	);
	await db.query(`alter table "t" drop column c2;`);
	await introspect(db, () => true, new EmptyProgressView(), () => {}, {
		schema: 'drizzle',
		table: 'drizzle_migrations',
	});
});
