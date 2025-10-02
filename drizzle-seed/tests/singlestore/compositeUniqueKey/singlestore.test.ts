import retry from 'async-retry';
import type { Container } from 'dockerode';
import { sql } from 'drizzle-orm';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import { drizzle } from 'drizzle-orm/singlestore';
import type { Connection } from 'mysql2/promise';
import { createConnection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { createDockerDB } from '../utils.ts';
import * as schema from './singlestoreSchema.ts';

let singleStoreContainer: Container;
let client: Connection | undefined;
let db: SingleStoreDriverDatabase;

beforeAll(async () => {
	const { url: connectionString, container } = await createDockerDB();
	singleStoreContainer = container;

	client = await retry(async (_, _attemptNumber) => {
		client = await createConnection({ uri: connectionString, supportBigNumbers: true });
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 1000,
		maxTimeout: 1000,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});

	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
	await client.changeUser({ database: 'drizzle' });
	db = drizzle(client);

	await db.execute(
		sql`
			CREATE TABLE \`composite_example0\` (
				\`id\` integer not null,
				\`name\` varchar(256) not null,
				SHARD(\`id\`,\`name\`),
				CONSTRAINT \`composite_example_id_name_unique\` UNIQUE(\`id\`,\`name\`)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE ROWSTORE TABLE \`composite_example\` (
				\`id\` integer not null,
				\`name\` varchar(256) not null,
			    SHARD(\`id\`,\`name\`),
				CONSTRAINT \`composite_example_id_name_unique\` UNIQUE(\`id\`,\`name\`),
				CONSTRAINT \`custom_name\` UNIQUE(\`id\`,\`name\`)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE ROWSTORE TABLE \`unique_column_in_composite_of_two_0\` (
				\`id\` integer not null unique,
				\`name\` varchar(256) not null,
			    SHARD(\`id\`),
				CONSTRAINT \`custom_name0\` UNIQUE(\`id\`,\`name\`)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE ROWSTORE TABLE \`unique_column_in_composite_of_two_1\` (
				\`id\` integer not null,
				\`name\` varchar(256) not null,
			    SHARD(\`id\`),
				CONSTRAINT \`custom_name1\` UNIQUE(\`id\`,\`name\`),
				CONSTRAINT \`custom_name1_id\` UNIQUE(\`id\`)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE ROWSTORE TABLE \`unique_column_in_composite_of_three_0\` (
				\`id\` integer not null unique,
				\`name\` varchar(256) not null,
				\`slug\` varchar(256) not null,
			    SHARD(\`id\`),
				CONSTRAINT \`custom_name2\` UNIQUE(\`id\`,\`name\`,\`slug\`)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE ROWSTORE TABLE \`unique_column_in_composite_of_three_1\` (
				\`id\` integer not null,
				\`name\` varchar(256) not null,
				\`slug\` varchar(256) not null,
			    SHARD(\`id\`),
				CONSTRAINT \`custom_name3\` UNIQUE(\`id\`,\`name\`,\`slug\`),
				CONSTRAINT \`custom_name3_id\` UNIQUE(\`id\`)
			);
		`,
	);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singleStoreContainer?.stop().catch(console.error);
});

afterEach(async () => {
	await reset(db, schema);
});

test('basic seed test', async () => {
	const currSchema0 = { composite0: schema.composite0 };
	await seed(db, currSchema0, { count: 16 });

	const composite0 = await db.select().from(schema.composite0);

	expect(composite0.length).toBe(16);
	await reset(db, currSchema0);

	// ------------------------------------------------------------
	const currSchema = { composite: schema.composite };
	await seed(db, currSchema, { count: 16 });

	let composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	// ------------------------------------------------------------
	await seed(db, currSchema, { count: 16 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	// ------------------------------------------------------------
	await seed(db, currSchema, { count: 16 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	// ------------------------------------------------------------
	await seed(db, currSchema, { count: 17 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(17);
	await reset(db, currSchema);
});

test('unique column in composite of 2 columns', async () => {
	const currSchema0 = { uniqueColumnInCompositeOfTwo0: schema.uniqueColumnInCompositeOfTwo0 };
	await seed(db, currSchema0, { count: 4 }).refine((funcs) => ({
		uniqueColumnInCompositeOfTwo0: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	let composite = await db.select().from(schema.uniqueColumnInCompositeOfTwo0);

	expect(composite.length).toBe(4);
	await reset(db, currSchema0);

	// ------------------------------------------------------------
	const currSchema1 = { uniqueColumnInCompositeOfTwo1: schema.uniqueColumnInCompositeOfTwo1 };
	await seed(db, currSchema1, { count: 4 }).refine((funcs) => ({
		uniqueColumnInCompositeOfTwo1: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	composite = await db.select().from(schema.uniqueColumnInCompositeOfTwo1);

	expect(composite.length).toBe(4);
	await reset(db, currSchema1);
});

test('unique column in composite of 3 columns', async () => {
	const currSchema0 = { uniqueColumnInCompositeOfThree0: schema.uniqueColumnInCompositeOfThree0 };
	await seed(db, currSchema0, { count: 16 }).refine((funcs) => ({
		uniqueColumnInCompositeOfThree0: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }),
				name: funcs.valuesFromArray({ values: ['a', 'b'] }),
				slug: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	let composite = await db.select().from(schema.uniqueColumnInCompositeOfThree0);

	expect(composite.length).toBe(16);
	await reset(db, currSchema0);

	// ------------------------------------------------------------
	const currSchema1 = { uniqueColumnInCompositeOfThree1: schema.uniqueColumnInCompositeOfThree1 };
	await seed(db, currSchema1, { count: 16 }).refine((funcs) => ({
		uniqueColumnInCompositeOfThree1: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }),
				name: funcs.valuesFromArray({ values: ['a', 'b'] }),
				slug: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	composite = await db.select().from(schema.uniqueColumnInCompositeOfThree1);

	expect(composite.length).toBe(16);
	await reset(db, currSchema1);
});
