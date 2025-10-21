import { sql } from 'drizzle-orm';

import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';

import type { Container } from 'dockerode';
import type { MsSqlDatabase } from 'drizzle-orm/node-mssql';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './mssqlSchema.ts';

let mssqlContainer: Container;
let client: mssql.ConnectionPool;
let db: MsSqlDatabase<any, any>;

beforeAll(async () => {
	const { options, container } = await createDockerDB('cyclic_tables');
	mssqlContainer = container;

	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mssql.connect(options);
			await client.connect();
			db = drizzle({ client });
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MsSQL');
		await client?.close().catch(console.error);
		await mssqlContainer?.stop().catch(console.error);
		throw lastError;
	}

	await db.execute(
		sql`
			create table [model]
			(
				[id]             int identity not null
					primary key,
				[name]           varchar(256) not null,
				[defaultImageId] int          null
			);
		`,
	);

	await db.execute(
		sql`
			create table [model_image]
			(
				[id]      int identity not null
					primary key,
				[url]     varchar(256) not null,
				[caption] varchar(256) null,
				[modelId] int          not null,
				constraint [model_image_modelId_model_id_fk]
					foreign key ([modelId]) references [model] ([id])
			);
		`,
	);

	await db.execute(
		sql`
			alter table [model]
			 add constraint [model_defaultImageId_model_image_id_fk]
				 foreign key ([defaultImageId]) references [model_image] ([id]);
		`,
	);

	// 3 tables case
	await db.execute(
		sql`
			create table [model1]
			(
				[id]             int identity not null
					primary key,
				[name]           varchar(256) not null,
				[userId]         int          null,
				[defaultImageId] int          null
			);
		`,
	);

	await db.execute(
		sql`
			create table [model_image1]
			(
				[id]      int identity not null
					primary key,
				[url]     varchar(256) not null,
				[caption] varchar(256) null,
				[modelId] int          not null,
				constraint [model_image1_modelId_model1_id_fk]
					foreign key ([modelId]) references [model1] ([id])
			);
		`,
	);

	await db.execute(
		sql`
			create table [user]
			(
				[id]        int identity not null
					primary key,
				[name]      text 		   null,
				[invitedBy] int  		   null,
				[imageId]   int  		   not null,
				constraint [user_imageId_model_image1_id_fk]
					foreign key ([imageId]) references [model_image1] ([id]),
				constraint [user_invitedBy_user_id_fk]
					foreign key ([invitedBy]) references [user] ([id])
			);
		`,
	);

	await db.execute(
		sql`
			alter table [model1]
			 add constraint [model1_userId_user_id_fk]
				 foreign key ([userId]) references [user] ([id]);
		`,
	);
});

afterAll(async () => {
	await client?.close().catch(console.error);
	await mssqlContainer?.stop().catch(console.error);
});

afterEach(async () => {
	await reset(db, schema);
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
