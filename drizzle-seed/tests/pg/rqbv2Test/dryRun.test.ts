import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { boolean, foreignKey, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { defineRelations } from 'drizzle-orm/relations';
import { expect, test, vi } from 'vitest';
import { seed } from '../../../src/index.ts';

// only column types that survive a driver round trip unchanged are used here, so that a dryRun result can be compared
// to a `select *` with a plain deep equality. `numeric`/`decimal` come back as strings and would force the comparison
// to be loosened, so they are left out on purpose.
const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
	email: varchar('email', { length: 256 }),
	isActive: boolean('is_active'),
});

const posts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id'),
	title: text('title'),
	views: integer('views'),
});

const acyclicSchema = { users, posts };

const acyclicRelations = defineRelations(acyclicSchema, (r) => ({
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

const acyclicDdl = [
	sql`create table users (id integer primary key, name text, email varchar(256), is_active boolean)`,
	sql`create table posts (id integer primary key, author_id integer, title text, views integer)`,
];

// a real foreign key constraint in both directions, so the cycle is a genuine one: seeding it takes an insert pass
// that leaves "default_image_id" null and a second update pass that fills it in
const model = pgTable('model', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	defaultImageId: integer('default_image_id'),
}, (t) => [
	foreignKey({ columns: [t.defaultImageId], foreignColumns: [modelImage.id] }),
]);

const modelImage = pgTable('model_image', {
	id: integer('id').primaryKey(),
	url: text('url').notNull(),
	modelId: integer('model_id').notNull().references((): AnyPgColumn => model.id),
});

const cyclicSchema = { model, modelImage };

const cyclicDdl = [
	sql`create table model_image (id integer primary key, url text not null, model_id integer not null)`,
	sql`create table model (id integer primary key, name text not null, default_image_id integer references model_image(id))`,
	sql`alter table model_image add constraint model_image_model_id_fk foreign key (model_id) references model(id)`,
];

const makeDb = async (ddl: typeof acyclicDdl, relations?: any) => {
	const client = new PGlite();
	const db = relations === undefined ? drizzle({ client }) : drizzle({ client, relations });
	for (const query of ddl) await db.execute(query);

	return { client, db };
};

test('dryRun returns exactly the rows a real seed inserts on an acyclic schema', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const generated = await seed(db, acyclicSchema, { count: 8, seed: 1 }).dryRun();

	await seed(db, acyclicSchema, { count: 8, seed: 1 });

	const insertedUsers = await db.select().from(users).orderBy(users.id);
	const insertedPosts = await db.select().from(posts).orderBy(posts.id);

	expect(insertedUsers).toEqual(generated.users);
	expect(insertedPosts).toEqual(generated.posts);
	expect(insertedUsers.length).toBe(8);
	expect(insertedPosts.length).toBe(8);
});

test('dryRun reproduces the second update pass of a cyclic schema', async () => {
	const { db } = await makeDb(cyclicDdl);

	const generated = await seed(db, cyclicSchema, { count: 8, seed: 1 }).dryRun();

	await seed(db, cyclicSchema, { count: 8, seed: 1 });

	const insertedModels = await db.select().from(model).orderBy(model.id);
	const insertedImages = await db.select().from(modelImage).orderBy(modelImage.id);

	expect(insertedModels).toEqual(generated.model);
	expect(insertedImages).toEqual(generated.modelImage);
	// the cyclic column is the one the update pass fills, so a dryRun that skipped the merge would leave it null
	expect(insertedModels.every((row) => row.defaultImageId !== null)).toBe(true);
	expect(generated.model.every((row) => row.defaultImageId !== null && row.defaultImageId !== undefined)).toBe(true);
});

test('dryRun issues no database traffic and leaves the tables empty', async () => {
	const { client, db } = await makeDb(acyclicDdl, acyclicRelations);

	const clientQuery = vi.spyOn(client, 'query');
	const clientExec = vi.spyOn(client, 'exec');
	const clientTransaction = vi.spyOn(client, 'transaction');
	const dbInsert = vi.spyOn(db, 'insert');
	const dbUpdate = vi.spyOn(db, 'update');
	const dbExecute = vi.spyOn(db, 'execute');

	const generated = await seed(db, acyclicSchema, { count: 4, seed: 3 }).dryRun();

	expect(clientQuery).toHaveBeenCalledTimes(0);
	expect(clientExec).toHaveBeenCalledTimes(0);
	expect(clientTransaction).toHaveBeenCalledTimes(0);
	expect(dbInsert).toHaveBeenCalledTimes(0);
	expect(dbUpdate).toHaveBeenCalledTimes(0);
	expect(dbExecute).toHaveBeenCalledTimes(0);

	vi.restoreAllMocks();

	expect(generated.users.length).toBe(4);
	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);
});

test('refine().dryRun() applies counts and column generators without writing', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const generated = await seed(db, acyclicSchema, { count: 8, seed: 5 }).refine((funcs) => ({
		users: {
			count: 3,
			columns: { name: funcs.valuesFromArray({ values: ['Alice', 'Bob'] }) },
		},
		posts: {
			count: 2,
			columns: { title: funcs.default({ defaultValue: 'refined title' }) },
		},
	})).dryRun();

	expect(generated.users.length).toBe(3);
	expect(generated.posts.length).toBe(2);
	expect(generated.users.every((row) => ['Alice', 'Bob'].includes(row.name as string))).toBe(true);
	expect(generated.posts.every((row) => row.title === 'refined title')).toBe(true);

	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);
});

test('refine() without dryRun still inserts rows', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	await seed(db, acyclicSchema, { count: 8, seed: 5 }).refine((funcs) => ({
		users: {
			count: 3,
			columns: { name: funcs.default({ defaultValue: 'inserted name' }) },
		},
	}));

	const insertedUsers = await db.select().from(users);
	const insertedPosts = await db.select().from(posts);

	expect(insertedUsers.length).toBe(3);
	expect(insertedPosts.length).toBe(8);
	expect(insertedUsers.every((row) => row.name === 'inserted name')).toBe(true);
});

test('two dryRun calls with the same count and seed return the same rows', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const first = await seed(db, acyclicSchema, { count: 5, seed: 7 }).dryRun();
	const second = await seed(db, acyclicSchema, { count: 5, seed: 7 }).dryRun();

	expect(second).toEqual(first);
});

test('dryRun is keyed by the schema table keys only', async () => {
	const { db } = await makeDb(acyclicDdl);

	const schemaWithExtras = {
		users,
		posts,
		relations: acyclicRelations,
		seedMeta: 'not a table',
	};

	const generated = await seed(db, schemaWithExtras, { count: 6, seed: 9, relations: acyclicRelations })
		.refine(() => ({
			posts: { count: 0 },
		}))
		.dryRun();

	expect(Object.keys(generated).sort()).toEqual(['posts', 'users']);
	expect(generated.users.length).toBe(6);
	expect(generated.posts).toEqual([]);
});

test('a column refined to false comes back undefined and is inserted as null', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const refine = () => ({ users: { columns: { email: false as const } } });

	const generated = await seed(db, acyclicSchema, { count: 4, seed: 11 }).refine(refine).dryRun();

	expect(generated.users.length).toBe(4);
	expect(generated.users.every((row) => row.email === undefined)).toBe(true);
	expect(generated.users.every((row) => typeof row.name === 'string')).toBe(true);

	await seed(db, acyclicSchema, { count: 4, seed: 11 }).refine(refine);

	// the refined column is left out of the insert entirely, so the database is the one that puts a null there
	const insertedUsers = await db.select().from(users).orderBy(users.id);
	expect(insertedUsers.every((row) => row.email === null)).toBe(true);
	expect(insertedUsers.map((row) => row.name)).toEqual(generated.users.map((row) => row.name));
});

test('every child row of a dryRun references a parent row of the same dryRun', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const generated = await seed(db, acyclicSchema, { count: 7, seed: 13 }).dryRun();

	const userIds = new Set(generated.users.map((row) => row.id));

	expect(generated.posts.length).toBe(7);
	expect(generated.posts.every((row) => row.authorId !== null && userIds.has(row.authorId!))).toBe(true);
});

test('an error thrown inside refine rejects rather than escaping while the chain is built', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	const failing = () => {
		throw new Error('refinement blew up');
	};

	// building the chain must not throw on its own - the callback only runs once the promise is awaited
	const seeding = seed(db, acyclicSchema).refine(failing);
	const generating = seed(db, acyclicSchema).refine(failing).dryRun();

	await expect(seeding).rejects.toThrow('refinement blew up');
	await expect(generating).rejects.toThrow('refinement blew up');
});

test('the same refined chain can be run more than once', async () => {
	const { db } = await makeDb(acyclicDdl, acyclicRelations);

	// generators carry state, so a chain that reused them would return different rows the second time round
	const chain = seed(db, acyclicSchema, { count: 4, seed: 17 }).refine((funcs) => ({
		users: { count: 4, columns: { name: funcs.firstName() } },
	}));

	expect(await chain.dryRun()).toEqual(await chain.dryRun());
});
