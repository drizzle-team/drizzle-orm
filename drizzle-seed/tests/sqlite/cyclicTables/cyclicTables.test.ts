import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import * as schema from './sqliteSchema.ts';

let client: BetterSqlite3.Database;
let db: BetterSQLite3Database;

beforeAll(async () => {
	client = new BetterSqlite3(':memory:');

	db = drizzle({ client });

	db.run(
		sql`
			create table model
			(
			    id             integer not null
			        primary key,
			    name           text    not null,
			    defaultImageId integer,
				foreign key (defaultImageId) references model_image
			);
		`,
	);

	db.run(
		sql`
			create table model_image
			(
			    id      integer not null
			        primary key,
			    url     text    not null,
			    caption text,
			    modelId integer not null
			        references model
			);
		`,
	);

	// 3 tables case
	db.run(
		sql`
			create table model1
			(
			    id             integer not null
			        primary key,
			    name           text    not null,
			    userId         integer,
			    defaultImageId integer,
				foreign key (defaultImageId) references model_image1,
				foreign key (userId) references user
			);
		`,
	);

	db.run(
		sql`
			create table model_image1
			(
			    id      integer not null
			        primary key,
			    url     text    not null,
			    caption text,
			    modelId integer not null
			        references model1
			);
		`,
	);

	db.run(
		sql`
			create table user
			(
			    id        integer not null
			        primary key,
			    name      text,
			    invitedBy integer
			        references user,
			    imageId   integer not null
			        references model_image1
			);
		`,
	);
});

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	client.close();
});

test('2 cyclic tables test', async () => {
	await seed(db, {
		modelTable: schema.modelTable,
		modelImageTable: schema.modelImageTable,
	});

	const modelTable = await db.select().from(schema.modelTable);
	const modelImageTable = await db.select().from(schema.modelImageTable);

	expect(modelTable.length).toBe(10);
	let predicate = modelTable.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	expect(modelImageTable.length).toBe(10);
	predicate = modelImageTable.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});

test('3 cyclic tables test', async () => {
	await seed(db, {
		modelTable1: schema.modelTable1,
		modelImageTable1: schema.modelImageTable1,
		user: schema.user,
	});

	const modelTable1 = await db.select().from(schema.modelTable1);
	const modelImageTable1 = await db.select().from(schema.modelImageTable1);
	const user = await db.select().from(schema.user);

	expect(modelTable1.length).toBe(10);
	let predicate = modelTable1.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	expect(modelImageTable1.length).toBe(10);
	predicate = modelImageTable1.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);

	expect(user.length).toBe(10);
	predicate = user.every((row) => Object.values(row).every((val) => val !== undefined && val !== null));
	expect(predicate).toBe(true);
});
