import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { boolean, foreignKey, integer, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';

// only column types that survive a driver round trip unchanged are used here, so that a database filled by replaying
// the statements can be compared to one filled by a real seed with a plain deep equality
const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
	email: varchar('email', { length: 256 }),
	isActive: boolean('is_active'),
});

const posts = pgTable('posts', {
	// a plain integer primary key: nothing in the database fills it, so it has no sequence to move on
	id: integer('id').primaryKey(),
	authorId: integer('author_id').references(() => users.id),
	title: text('title'),
	views: integer('views'),
});

const schema = { users, posts };

const ddl = [
	sql`create table users (id serial primary key, name text, email varchar(256), is_active boolean)`,
	sql`create table posts (id integer primary key, author_id integer references users(id), title text, views integer)`,
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

// twelve columns, so that PGlite's limit of 32740 parameters per statement is reached at 2728 rows - well below the
// number of rows a batch would otherwise hold
const wide = pgTable('wide', {
	id: integer('id').primaryKey(),
	c1: integer('c1'),
	c2: integer('c2'),
	c3: integer('c3'),
	c4: integer('c4'),
	c5: integer('c5'),
	c6: integer('c6'),
	c7: integer('c7'),
	c8: integer('c8'),
	c9: integer('c9'),
	c10: integer('c10'),
	c11: integer('c11'),
});

const wideDdl = [
	sql`create table wide (id integer primary key, c1 integer, c2 integer, c3 integer, c4 integer, c5 integer, c6 integer, c7 integer, c8 integer, c9 integer, c10 integer, c11 integer)`,
];

const makeDb = async (tableDdl: SQL[]) => {
	const client = new PGlite();
	const db = drizzle({ client });
	for (const query of tableDdl) await db.execute(query);

	return { client, db };
};

const replay = async (db: Awaited<ReturnType<typeof makeDb>>['db'], statements: string[]) => {
	for (const statement of statements) await db.execute(sql.raw(statement));
};

test('replaying the statements fills a database with exactly what a real seed writes', async () => {
	const replayed = await makeDb(ddl);
	const seeded = await makeDb(ddl);

	const statements = await seed(replayed.db, schema, { count: 8, seed: 1 }).dryRun({ output: 'sql' });
	await replay(replayed.db, statements);

	await seed(seeded.db, schema, { count: 8, seed: 1 });

	const replayedUsers = await replayed.db.select().from(users).orderBy(users.id);
	const replayedPosts = await replayed.db.select().from(posts).orderBy(posts.id);

	expect(replayedUsers).toEqual(await seeded.db.select().from(users).orderBy(users.id));
	expect(replayedPosts).toEqual(await seeded.db.select().from(posts).orderBy(posts.id));
	expect(replayedUsers.length).toBe(8);
	expect(replayedPosts.length).toBe(8);

	await replayed.client.close();
	await seeded.client.close();
});

test('producing the statements leaves the tables empty', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 8, seed: 1 }).dryRun({ output: 'sql' });

	expect(statements.length).toBeGreaterThan(0);
	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);

	await client.close();
});

test('replaying the statements of a cyclic schema fills the cycle in just as a real seed does', async () => {
	const replayed = await makeDb(cyclicDdl);
	const seeded = await makeDb(cyclicDdl);

	const statements = await seed(replayed.db, cyclicSchema, { count: 8, seed: 1 }).dryRun({ output: 'sql' });

	// the cyclic column cannot be written by the insert pass, so the second pass has to show up as update statements
	expect(statements.some((statement) => statement.startsWith('update '))).toBe(true);

	await replay(replayed.db, statements);

	await seed(seeded.db, cyclicSchema, { count: 8, seed: 1 });

	const replayedModels = await replayed.db.select().from(model).orderBy(model.id);
	const replayedImages = await replayed.db.select().from(modelImage).orderBy(modelImage.id);

	expect(replayedModels).toEqual(await seeded.db.select().from(model).orderBy(model.id));
	expect(replayedImages).toEqual(await seeded.db.select().from(modelImage).orderBy(modelImage.id));
	expect(replayedModels.length).toBe(8);
	// a replay that dropped the update pass would leave the cyclic column null
	expect(replayedModels.every((row) => row.defaultImageId !== null)).toBe(true);

	await replayed.client.close();
	await seeded.client.close();
});

test('values are written into the statements and quotes in them are escaped', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 4, seed: 1 }).refine((funcs) => ({
		users: { columns: { name: funcs.valuesFromArray({ values: ["O'Brien"] }) } },
	})).dryRun({ output: 'sql' });

	expect(statements.every((statement) => !statement.includes('$1'))).toBe(true);
	expect(statements.some((statement) => statement.includes("'O''Brien'"))).toBe(true);

	// the escaping is only right if the database accepts the statement and gives the value back unchanged
	await replay(db, statements);

	const insertedUsers = await db.select().from(users).orderBy(users.id);
	expect(insertedUsers.length).toBe(4);
	expect(insertedUsers.every((row) => row.name === "O'Brien")).toBe(true);

	await client.close();
});

test('a small seed is a single insert statement per table carrying every row', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 6, seed: 2 }).dryRun({ output: 'sql' });

	const userInserts = statements.filter((statement) => statement.startsWith('insert into "users"'));
	const postInserts = statements.filter((statement) => statement.startsWith('insert into "posts"'));

	expect(userInserts.length).toBe(1);
	expect(postInserts.length).toBe(1);

	// running that one statement is enough to put the whole table in place
	await db.execute(sql.raw(userInserts[0]!));
	expect((await db.select().from(users)).length).toBe(6);

	await db.execute(sql.raw(postInserts[0]!));
	expect((await db.select().from(posts)).length).toBe(6);

	await client.close();
});

test('a seed wider than the parameter limit is split across several insert statements', async () => {
	const { client, db } = await makeDb(wideDdl);

	// 5000 rows of twelve columns are 60000 parameters, over twice what PGlite takes in one statement
	const statements = await seed(db, { wide }, { count: 5000, seed: 1 }).dryRun({ output: 'sql' });

	const inserts = statements.filter((statement) => statement.startsWith('insert into "wide"'));
	expect(inserts.length).toBeGreaterThan(1);

	await replay(db, statements);

	expect((await db.select({ id: wide.id }).from(wide)).length).toBe(5000);

	await client.close();
});

test('statements carry no trailing semicolon and join into a script that runs in one go', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 5, seed: 4 }).dryRun({ output: 'sql' });

	expect(statements.every((statement) => !statement.trimEnd().endsWith(';'))).toBe(true);

	// PGlite's query protocol takes one command per call, so the whole script goes through the client itself - which is
	// the single call a user pasting the saved file into their database would make
	await client.exec(statements.join(';\n') + ';');

	expect((await db.select().from(users)).length).toBe(5);
	expect((await db.select().from(posts)).length).toBe(5);

	await client.close();
});

test('only a column the database fills itself gets a sequence statement', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 5, seed: 6 }).dryRun({ output: 'sql' });

	const setvals = statements.filter((statement) => statement.includes('setval'));

	expect(setvals.length).toBe(1);
	expect(setvals[0]).toContain(`pg_get_serial_sequence('"users"', 'id')`);
	// "posts"."id" is a plain integer, so there is no sequence of its own to move
	expect(setvals.some((statement) => statement.includes('"posts"'))).toBe(false);

	await replay(db, statements);

	// without the setval the sequence would still be at 1 and this would collide with the row the seed wrote
	const [inserted] = await db.insert(users).values({ name: 'written after the replay' }).returning();

	expect(inserted!.id).toBe(6);
	expect((await db.select().from(users)).length).toBe(6);

	await client.close();
});

test('refined counts and generators are the ones the statements carry', async () => {
	const { client, db } = await makeDb(ddl);

	const statements = await seed(db, schema, { count: 8, seed: 5 }).refine((funcs) => ({
		users: {
			count: 3,
			columns: { name: funcs.default({ defaultValue: 'refined name' }) },
		},
		posts: {
			count: 2,
			columns: { title: funcs.valuesFromArray({ values: ['refined title'] }) },
		},
	})).dryRun({ output: 'sql' });

	expect(statements.some((statement) => statement.includes("'refined name'"))).toBe(true);
	expect(statements.some((statement) => statement.includes("'refined title'"))).toBe(true);

	await replay(db, statements);

	const insertedUsers = await db.select().from(users).orderBy(users.id);
	const insertedPosts = await db.select().from(posts).orderBy(posts.id);

	expect(insertedUsers.length).toBe(3);
	expect(insertedPosts.length).toBe(2);
	expect(insertedUsers.every((row) => row.name === 'refined name')).toBe(true);
	expect(insertedPosts.every((row) => row.title === 'refined title')).toBe(true);

	await client.close();
});

const identityUsers = pgTable('identity_users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name'),
});

const identityDdl = [
	sql`create table identity_users (id integer primary key generated always as identity, name text)`,
];

test('a statement writing an identity column keeps the override that lets it', async () => {
	const replayed = await makeDb(identityDdl);
	const seeded = await makeDb(identityDdl);

	const statements = await seed(replayed.db, { users: identityUsers }, { count: 5, seed: 1 }).dryRun({
		output: 'sql',
	});

	// without this the database refuses the write, since it is the one that is supposed to fill the column
	expect(statements.some((statement) => statement.includes('overriding system value'))).toBe(true);

	await replay(replayed.db, statements);
	await seed(seeded.db, { users: identityUsers }, { count: 5, seed: 1 });

	const replayedRows = await replayed.db.select().from(identityUsers).orderBy(identityUsers.id);

	expect(replayedRows.length).toBe(5);
	expect(replayedRows).toEqual(await seeded.db.select().from(identityUsers).orderBy(identityUsers.id));

	await replayed.client.close();
	await seeded.client.close();
});
