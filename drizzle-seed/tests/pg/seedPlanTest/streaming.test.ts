import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { boolean, foreignKey, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, test, vi } from 'vitest';
import { seed } from '../../../src/index.ts';

// only column types that survive a driver round trip unchanged are used here, so that generated rows can be compared
// with a plain deep equality
const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
	email: varchar('email', { length: 256 }),
	isActive: boolean('is_active'),
});

const posts = pgTable('posts', {
	id: integer('id').primaryKey(),
	authorId: integer('author_id').references(() => users.id),
	title: text('title'),
});

const tags = pgTable('tags', {
	id: integer('id').primaryKey(),
	label: text('label'),
});

// the schema object deliberately lists the child table first, so that an assertion on the order writes come out in is
// about the order the tables were generated in and not about the order they were declared in
const relatedSchema = { posts, users };

const acyclicDdl = [
	sql`create table users (id integer primary key, name text, email varchar(256), is_active boolean)`,
	sql`create table posts (id integer primary key, author_id integer references users(id), title text)`,
	sql`create table tags (id integer primary key, label text)`,
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

// a table long enough that its rows do not fit in a single batch
const wide = pgTable('wide', {
	id: integer('id').primaryKey(),
	name: text('name'),
	label: text('label'),
});

const wideDdl = [sql`create table wide (id integer primary key, name text, label text)`];

const makeDb = async (ddl: typeof acyclicDdl) => {
	const client = new PGlite();
	const db = drizzle({ client });
	for (const query of ddl) await db.execute(query);

	return { client, db };
};

type Write =
	| { type: 'insert'; tableName: string; rows: { [column: string]: unknown }[] }
	| {
		type: 'update';
		tableName: string;
		values: { [column: string]: unknown };
		whereColumn: string;
		whereValue: unknown;
	};

const collect = async (dryRun: AsyncIterable<unknown>) => {
	const writes: Write[] = [];
	for await (const write of dryRun) writes.push(write as Write);

	return writes;
};

/**
 * Replays a stream of writes the way a consumer of it would: every insert, and then every update on top of the rows
 * the inserts produced. What comes out is what the awaited form of the same dry run has to hand back.
 */
const applyWrites = (writes: Write[]) => {
	const tables: { [tableName: string]: { [column: string]: unknown }[] } = {};

	for (const write of writes) {
		if (write.type !== 'insert') continue;
		tables[write.tableName] = [...(tables[write.tableName] ?? []), ...write.rows.map((row) => ({ ...row }))];
	}

	for (const write of writes) {
		if (write.type !== 'update') continue;
		for (const row of tables[write.tableName] ?? []) {
			if (row[write.whereColumn] === write.whereValue) Object.assign(row, write.values);
		}
	}

	return tables;
};

test('iterating a dryRun yields inserts parent table first and their rows add up to the awaited result', async () => {
	const { db } = await makeDb(acyclicDdl);

	const generated = await seed(db, relatedSchema, { count: 6, seed: 1 }).dryRun();
	const writes = await collect(seed(db, relatedSchema, { count: 6, seed: 1 }).dryRun());

	// an acyclic schema needs no second pass, so nothing but inserts can come out of it
	expect(writes.every((write) => write.type === 'insert')).toBe(true);
	// the child table references the parent one, so it can only be generated once the parent rows exist
	expect(writes.map((write) => write.tableName)).toEqual(['users', 'posts']);

	expect(applyWrites(writes)).toEqual({ users: generated.users, posts: generated.posts });
	expect(generated.users.length).toBe(6);
	expect(generated.posts.length).toBe(6);
});

test('iterating a dryRun issues no database traffic and leaves the tables empty', async () => {
	const { client, db } = await makeDb(acyclicDdl);

	const clientQuery = vi.spyOn(client, 'query');
	const clientExec = vi.spyOn(client, 'exec');
	const clientTransaction = vi.spyOn(client, 'transaction');
	const dbInsert = vi.spyOn(db, 'insert');
	const dbUpdate = vi.spyOn(db, 'update');
	const dbExecute = vi.spyOn(db, 'execute');

	const writes = await collect(seed(db, relatedSchema, { count: 4, seed: 3 }).dryRun());

	expect(clientQuery).toHaveBeenCalledTimes(0);
	expect(clientExec).toHaveBeenCalledTimes(0);
	expect(clientTransaction).toHaveBeenCalledTimes(0);
	expect(dbInsert).toHaveBeenCalledTimes(0);
	expect(dbUpdate).toHaveBeenCalledTimes(0);
	expect(dbExecute).toHaveBeenCalledTimes(0);

	vi.restoreAllMocks();

	expect(writes.length).toBeGreaterThan(0);
	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);
});

test('awaiting a dryRun and iterating the same object give the same data', async () => {
	const { db } = await makeDb(acyclicDdl);

	const dryRun = seed(db, relatedSchema, { count: 7, seed: 5 }).dryRun();

	const generated = await dryRun;
	const writes = await collect(dryRun);

	expect(applyWrites(writes)).toEqual({ users: generated.users, posts: generated.posts });
});

test('iterating the same dryRun twice gives the same data', async () => {
	const { db } = await makeDb(acyclicDdl);

	const dryRun = seed(db, relatedSchema, { count: 7, seed: 5 }).dryRun();

	// generators carry state, so a second pass that reused them would come back with different rows
	const first = await collect(dryRun);
	const second = await collect(dryRun);

	expect(second).toEqual(first);
	expect(applyWrites(second)).toEqual(applyWrites(first));
});

test('iterating a sql dryRun yields the statements the awaited form returns, in the same order', async () => {
	const { db } = await makeDb(acyclicDdl);

	const dryRun = seed(db, relatedSchema, { count: 6, seed: 7 }).dryRun({ output: 'sql' });

	const statements = await dryRun;
	const streamed: string[] = [];
	for await (const statement of dryRun) streamed.push(statement);

	expect(streamed).toEqual(statements);
	expect(streamed.length).toBeGreaterThan(0);
	// statements are handed over unterminated, so that a caller can join them however it likes
	expect(streamed.every((statement) => !statement.trimEnd().endsWith(';'))).toBe(true);
	expect(streamed[0]!.startsWith('insert into "users"')).toBe(true);
});

test('a cyclic schema also streams updates, and inserts plus updates rebuild the awaited result', async () => {
	const { db } = await makeDb(cyclicDdl);

	const generated = await seed(db, cyclicSchema, { count: 6, seed: 11 }).dryRun();
	const writes = await collect(seed(db, cyclicSchema, { count: 6, seed: 11 }).dryRun());

	// the column caught in the cycle cannot be filled by the insert pass, so a second pass has to update it
	expect(writes.some((write) => write.type === 'update')).toBe(true);
	expect(writes.filter((write) => write.type === 'update').every((write) => write.tableName === 'model')).toBe(true);
	// every insert comes before the first update: the rows have to exist before they can be pointed at each other
	const lastInsert = writes.reduce((last, write, index) => write.type === 'insert' ? index : last, -1);
	expect(writes.findIndex((write) => write.type === 'update')).toBe(lastInsert + 1);

	expect(applyWrites(writes)).toEqual({ model: generated.model, modelImage: generated.modelImage });
	expect(generated.model.every((row) => row.defaultImageId !== null && row.defaultImageId !== undefined)).toBe(true);
});

test('breaking out of a dryRun after the first chunk leaves the rest of the table ungenerated', async () => {
	const { db } = await makeDb(wideDdl);

	const count = 60_000;
	const dryRun = seed(db, { wide }, { count, seed: 13 }).dryRun();

	let firstChunk: Write | undefined;
	let chunksSeen = 0;
	for await (const write of dryRun) {
		chunksSeen += 1;
		firstChunk = write as Write;
		break;
	}

	// abandoning the loop is enough to stop the generation: the first chunk is a batch, not the whole table
	expect(chunksSeen).toBe(1);
	expect(firstChunk?.type).toBe('insert');
	const firstChunkRows = firstChunk?.type === 'insert' ? firstChunk.rows.length : 0;
	expect(firstChunkRows).toBeGreaterThan(0);
	expect(firstChunkRows).toBeLessThan(count);

	// and the table really does take more than one batch, so the chunk above was not simply all there was
	let batches = 0;
	let rowsSeen = 0;
	for await (const write of dryRun) {
		if (write.type !== 'insert') continue;
		batches += 1;
		rowsSeen += write.rows.length;
	}

	expect(batches).toBeGreaterThan(1);
	expect(rowsSeen).toBe(count);
});

test('refinements made before iterating apply to the streamed writes', async () => {
	const { db } = await makeDb(acyclicDdl);

	const writes = await collect(
		seed(db, relatedSchema, { count: 8, seed: 17 }).refine((funcs) => ({
			users: {
				count: 3,
				columns: { name: funcs.default({ defaultValue: 'streamed name' }) },
			},
			posts: {
				count: 2,
				columns: { title: funcs.valuesFromArray({ values: ['first', 'second'] }) },
			},
		})).dryRun(),
	);

	const rows = applyWrites(writes);

	expect(rows['users']!.length).toBe(3);
	expect(rows['posts']!.length).toBe(2);
	expect(rows['users']!.every((row) => row['name'] === 'streamed name')).toBe(true);
	expect(rows['posts']!.every((row) => ['first', 'second'].includes(row['title'] as string))).toBe(true);

	expect(await db.select().from(users)).toEqual([]);
	expect(await db.select().from(posts)).toEqual([]);
});

test('the awaited result keeps generation order and holds a table refined to zero rows as an empty array', async () => {
	const { db } = await makeDb(acyclicDdl);

	const generated = await seed(db, { posts, users, tags }, { count: 5, seed: 19 })
		.refine(() => ({ tags: { count: 0 } }))
		.dryRun();

	// "posts" is the first key of the schema object, but the table it references is generated before it, and "tags",
	// which nothing is generated for, comes last
	expect(Object.keys(generated)).toEqual(['users', 'posts', 'tags']);
	expect(generated.tags).toEqual([]);
	expect(generated.users.length).toBe(5);
	expect(generated.posts.length).toBe(5);
});
