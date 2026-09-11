import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { foreignKey, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { defineRelations } from 'drizzle-orm/relations';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import { getSchemaInfo } from '../../../src/common.ts';
import { seed } from '../../../src/index.ts';
import { mapPgColumns } from '../../../src/pg-core/index.ts';

const clients: PGlite[] = [];

const createDb = async (ddl: SQL[]) => {
	const client = new PGlite();
	clients.push(client);

	const db = drizzle({ client });
	for (const query of ddl) await db.execute(query);

	return db;
};

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	for (const client of clients) await client.close();
});

// 1. self-identity relation
const nodes = pgTable('c1_nodes', {
	id: integer().primaryKey(),
	name: text(),
});

const nodesSchema = { nodes };

const nodesRelations = defineRelations(nodesSchema, (r) => ({
	nodes: {
		self: r.many.nodes({ from: r.nodes.id, to: r.nodes.id }),
	},
}));

test('a relation joining a table to itself on the very same column yields no relations', async () => {
	const db = await createDb([sql`create table c1_nodes (id integer primary key, name text)`]);

	const { relations } = getSchemaInfo(nodesSchema, nodesSchema, mapPgColumns, nodesRelations);
	expect(relations).toEqual([]);

	await seed(db, nodesSchema, { count: 4, seed: 1, relations: nodesRelations });

	expect((await db.select().from(nodes)).length).toBe(4);
});

// 2. self foreign key described twice
const employees = pgTable('c2_employees', {
	id: integer().primaryKey(),
	name: text(),
	reportsTo: integer('reports_to').references((): AnyPgColumn => employees.id),
});

const employeesSchema = { employees };

const employeesRelations = defineRelations(employeesSchema, (r) => ({
	employees: {
		manager: r.one.employees({ from: r.employees.reportsTo, to: r.employees.id }),
		reports: r.many.employees({ from: r.employees.id, to: r.employees.reportsTo }),
	},
}));

test('a self foreign key declared both as a constraint and as a v2 relation stays a single acyclic relation', async () => {
	const db = await createDb([
		sql`create table c2_employees (id integer primary key, name text, reports_to integer references c2_employees(id))`,
	]);

	const { relations } = getSchemaInfo(employeesSchema, employeesSchema, mapPgColumns, employeesRelations);

	expect(relations.length).toBe(1);
	expect(relations[0]).toMatchObject({
		table: 'employees',
		columns: ['reportsTo'],
		refTable: 'employees',
		refColumns: ['id'],
		isCyclic: false,
	});

	await seed(db, employeesSchema, { count: 10, seed: 1, relations: employeesRelations });

	const rows = await db.select().from(employees);
	const ids = new Set(rows.map((row) => row.id));

	expect(rows.length).toBe(10);
	// a relation fills its column from the parent even when the column is nullable, so every value resolves to a row
	expect(rows.every((row) => row.reportsTo !== null && ids.has(row.reportsTo))).toBe(true);
	expect(rows.some((row) => row.reportsTo !== row.id)).toBe(true);
});

// 6. foreign key cycle whose links are declared once more as v2 relations
const carModels = pgTable('c6_models', {
	id: integer().primaryKey(),
	name: text().notNull(),
	defaultImageId: integer('default_image_id'),
}, (t) => [
	foreignKey({
		columns: [t.defaultImageId],
		foreignColumns: [carImages.id],
	}),
]);

const carImages = pgTable('c6_images', {
	id: integer().primaryKey(),
	url: text().notNull(),
	modelId: integer('model_id').notNull().references((): AnyPgColumn => carModels.id),
});

const carSchema = { models: carModels, images: carImages };

const carRelations = defineRelations(carSchema, (r) => ({
	models: {
		images: r.many.images({ from: r.models.id, to: r.images.modelId }),
		defaultImage: r.one.images({ from: r.models.defaultImageId, to: r.images.id }),
	},
	images: {
		model: r.one.models({ from: r.images.modelId, to: r.models.id }),
	},
}));

const carDdl = [
	sql`create table c6_models (id integer primary key, name text not null, default_image_id integer)`,
	sql`
		create table c6_images (
			id integer primary key,
			url text not null,
			model_id integer not null references c6_models(id)
		)
	`,
	sql`alter table c6_models add constraint c6_models_default_image_id_c6_images_id_fk foreign key (default_image_id) references c6_images(id)`,
];

test('v2 relations restating a cyclic pair of foreign keys change nothing about the seeded data', async () => {
	const withRelationsDb = await createDb(carDdl);
	const withoutRelationsDb = await createDb(carDdl);

	await seed(withRelationsDb, carSchema, { count: 8, seed: 11, relations: carRelations });
	await seed(withoutRelationsDb, carSchema, { count: 8, seed: 11 });

	expect(await withRelationsDb.select().from(carModels)).toEqual(await withoutRelationsDb.select().from(carModels));
	expect(await withRelationsDb.select().from(carImages)).toEqual(await withoutRelationsDb.select().from(carImages));
	expect((await withRelationsDb.select().from(carModels)).length).toBe(8);
});

// 7. graph invariants
const graphUsers = pgTable('c7_users', {
	id: integer().primaryKey(),
	name: text(),
	managerId: integer('manager_id'),
});

const graphPosts = pgTable('c7_posts', {
	id: integer().primaryKey(),
	authorId: integer('author_id').notNull().references(() => graphUsers.id),
	title: text(),
});

const graphGroups = pgTable('c7_groups', {
	id: integer().primaryKey(),
	name: text(),
});

const graphUsersToGroups = pgTable('c7_users_to_groups', {
	userId: integer('user_id').notNull(),
	groupId: integer('group_id').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.groupId] })]);

const graphSchema = {
	users: graphUsers,
	posts: graphPosts,
	groups: graphGroups,
	usersToGroups: graphUsersToGroups,
};

const graphRelations = defineRelations(graphSchema, (r) => ({
	users: {
		posts: r.many.posts(),
		manager: r.one.users({ from: r.users.managerId, to: r.users.id }),
		groups: r.many.groups({
			from: r.users.id.through(r.usersToGroups.userId),
			to: r.groups.id.through(r.usersToGroups.groupId),
		}),
	},
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

test('every relation points at the relation bucket of its parent table, and every bucket holds only its own table', async () => {
	const db = await createDb([
		sql`create table c7_users (id integer primary key, name text, manager_id integer)`,
		sql`create table c7_groups (id integer primary key, name text)`,
		sql`create table c7_posts (id integer primary key, author_id integer not null references c7_users(id), title text)`,
		sql`create table c7_users_to_groups (user_id integer not null, group_id integer not null, primary key (user_id, group_id))`,
	]);

	const { relations, tableRelations } = getSchemaInfo(graphSchema, graphSchema, mapPgColumns, graphRelations);

	expect(relations.length).toBe(4);
	for (const relation of relations) {
		expect(relation.refTableRels).toBe(tableRelations[relation.refTable]);
	}

	for (const [tableName, bucket] of Object.entries(tableRelations)) {
		for (const relation of bucket) {
			expect(relation.table).toBe(tableName);
		}
	}

	await seed(db, graphSchema, { count: 5, seed: 1, relations: graphRelations });

	expect((await db.select().from(graphUsersToGroups)).length).toBe(5);
});

// 8. entries of a relations config that are not relations
const oddUsers = pgTable('c8_users', {
	id: integer().primaryKey(),
	name: text(),
});

const oddPosts = pgTable('c8_posts', {
	id: integer().primaryKey(),
	authorId: integer('author_id').notNull(),
	title: text(),
});

const oddSchema = { users: oddUsers, posts: oddPosts };

const oddRelations = defineRelations(oddSchema, (r) => ({
	users: {
		postCount: 'not a relation at all' as any,
		nonsense: { from: 'users.id', to: 'posts.authorId' } as any,
		posts: r.many.posts(),
	},
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

test('entries of a relations config that are not relations are skipped', async () => {
	const db = await createDb([
		sql`create table c8_users (id integer primary key, name text)`,
		sql`create table c8_posts (id integer primary key, author_id integer not null, title text)`,
	]);

	const { relations } = getSchemaInfo(oddSchema, oddSchema, mapPgColumns, oddRelations);

	expect(relations.length).toBe(1);
	expect(relations[0]).toMatchObject({
		table: 'posts',
		columns: ['authorId'],
		refTable: 'users',
		refColumns: ['id'],
	});

	await seed(db, oddSchema, { count: 5, seed: 1, relations: oddRelations });

	const userIds = new Set((await db.select().from(oddUsers)).map((row) => row.id));
	const postRows = await db.select().from(oddPosts);

	expect(postRows.length).toBe(5);
	expect(postRows.every((row) => userIds.has(row.authorId))).toBe(true);
});

// a cycle held together by nullable columns ---------------------------------------------------------------------
const softModels = pgTable('c9_models', {
	id: integer().primaryKey(),
	coverId: integer('cover_id'),
	name: text(),
});

const softImages = pgTable('c9_images', {
	id: integer().primaryKey(),
	modelId: integer('model_id'),
	url: text(),
});

const softCycleSchema = { models: softModels, images: softImages };

// neither link exists in the database - both are declared only in the relations config
const softCycleRelations = defineRelations(softCycleSchema, (r) => ({
	models: { cover: r.one.images({ from: r.models.coverId, to: r.images.id }) },
	images: { model: r.one.models({ from: r.images.modelId, to: r.models.id }) },
}));

test('a relation cycle declared only in the config survives when its columns are nullable', async () => {
	const db = await createDb([
		sql`create table c9_models (id integer primary key, cover_id integer, name text)`,
		sql`create table c9_images (id integer primary key, model_id integer, url text)`,
	]);

	const { relations } = getSchemaInfo(softCycleSchema, softCycleSchema, mapPgColumns, softCycleRelations);

	// both links keep the direction they were declared with, and both are recognised as cyclic, which is what puts
	// them through the two pass generation instead of dropping or flipping one of them
	expect(relations.map((relation) => [relation.table, relation.columns, relation.refTable, relation.refColumns]))
		.toEqual([
			['models', ['coverId'], 'images', ['id']],
			['images', ['modelId'], 'models', ['id']],
		]);
	expect(relations.every((relation) => relation.isCyclic)).toBe(true);

	await seed(db, softCycleSchema, { count: 6, seed: 3, relations: softCycleRelations });

	const modelRows = await db.select().from(softModels);
	const imageRows = await db.select().from(softImages);
	const modelIds = new Set(modelRows.map((row) => row.id));
	const imageIds = new Set(imageRows.map((row) => row.id));

	expect(modelRows.length).toBe(6);
	expect(imageRows.length).toBe(6);
	expect(modelRows.every((row) => row.coverId === null || imageIds.has(row.coverId))).toBe(true);
	expect(imageRows.every((row) => row.modelId === null || modelIds.has(row.modelId))).toBe(true);
	// the second pass is what fills the side that could not be filled while its counterpart did not exist yet
	expect(modelRows.some((row) => row.coverId !== null)).toBe(true);
});

test('dryRun reproduces the second pass of a config-only cycle', async () => {
	const db = await createDb([
		sql`create table c9b_models (id integer primary key, cover_id integer, name text)`,
		sql`create table c9b_images (id integer primary key, model_id integer, url text)`,
	]);

	const models = pgTable('c9b_models', { id: integer().primaryKey(), coverId: integer('cover_id'), name: text() });
	const images = pgTable('c9b_images', { id: integer().primaryKey(), modelId: integer('model_id'), url: text() });
	const schema = { models, images };
	const relations = defineRelations(schema, (r) => ({
		models: { cover: r.one.images({ from: r.models.coverId, to: r.images.id }) },
		images: { model: r.one.models({ from: r.images.modelId, to: r.models.id }) },
	}));

	const generated = await seed(db, schema, { count: 6, seed: 4, relations }).dryRun();

	expect(await db.select().from(models)).toEqual([]);

	await seed(db, schema, { count: 6, seed: 4, relations });

	const byId = <T extends { id?: number | null }>(rows: T[]) =>
		[...rows].sort((row1, row2) => (row1.id ?? 0) - (row2.id ?? 0));

	expect(byId(await db.select().from(models))).toEqual(byId(generated.models));
	expect(byId(await db.select().from(images))).toEqual(byId(generated.images));
	expect(generated.models.some((row) => row.coverId !== null && row.coverId !== undefined)).toBe(true);
});
