import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
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
			create table model
			(
			    id             int          not null
			        primary key,
			    name           varchar(256) not null,
			    defaultImageId int          null
			);
		`,
		);

		await db.execute(
			sql`
			create table model_image
			(
			    id      int          not null
			        primary key,
			    url     varchar(256) not null,
			    caption varchar(256) null,
			    modelId int          not null
			);
		`,
		);

		// 3 tables case
		await db.execute(
			sql`
			create table model1
			(
			    id             int          not null
			        primary key,
			    name           varchar(256) not null,
			    userId         int          null,
			    defaultImageId int          null
			);
		`,
		);

		await db.execute(
			sql`
			create table model_image1
			(
			    id      int          not null
			        primary key,
			    url     varchar(256) not null,
			    caption varchar(256) null,
			    modelId int          not null
			);
		`,
		);

		await db.execute(
			sql`
			create table user
			(
			    id        int  not null
			        primary key,
			    name      text null,
			    invitedBy int  null,
			    imageId   int  not null
			);
		`,
		);

		resolveFunc('');
	}

	await promise;
});

test.afterEach(async ({ db }) => {
	await reset(db, schema);
});

test('2 cyclic tables test', async ({ db }) => {
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

test('3 cyclic tables test', async ({ db }) => {
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
