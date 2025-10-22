import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import * as schema from './pgSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite();

	db = drizzle({ client });

	await db.execute(
		sql`
			create table model_image
			(
			    id        serial
			        primary key,
			    url       varchar not null,
			    caption   varchar,
			    "modelId" integer not null
			);
		`,
	);

	await db.execute(
		sql`
			create table model
			      (
			          id               serial
			              primary key,
			          name             varchar not null,
			          "defaultImageId" integer
			              constraint "model_defaultImageId_model_image_id_fk"
			                  references model_image
			      );
		`,
	);

	await db.execute(
		sql`
			alter table model_image
						    add constraint "model_image_modelId_model_id_fk"
						        foreign key ("modelId") references model;
		`,
	);

	// 3 tables case
	await db.execute(
		sql`
			create table model_image1
			(
			    id        serial
			        primary key,
			    url       varchar not null,
			    caption   varchar,
			    "modelId" integer not null
			);
		`,
	);

	await db.execute(
		sql`
			create table "user"
			(
			    id          serial
			        primary key,
			    name        text,
			    "invitedBy" integer
			        constraint "user_invitedBy_user_id_fk"
			            references "user",
			    "imageId"   integer not null
			        constraint "user_imageId_model_image1_id_fk"
			            references model_image1
			);
		`,
	);

	await db.execute(
		sql`
			create table model1
			(
			    id               serial
			        primary key,
			    name             varchar not null,
			    "userId"         integer
			        constraint "model1_userId_user_id_fk"
			            references "user",
			    "defaultImageId" integer
			        constraint "model1_defaultImageId_model_image1_id_fk"
			            references model_image1
			);
		`,
	);

	await db.execute(
		sql`
			alter table model_image1
			 add constraint "model_image1_modelId_model1_id_fk"
			     foreign key ("modelId") references model1;
		`,
	);
});

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	await client.close();
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
