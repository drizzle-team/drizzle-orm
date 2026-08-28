import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { integer, pgTable, primaryKey, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyRelations } from 'drizzle-orm/relations';
import { defineRelations } from 'drizzle-orm/relations';
import { expect, test } from 'vitest';
import { getSchemaInfo } from '../../../src/common.ts';
import { seed } from '../../../src/index.ts';
import { mapPgColumns } from '../../../src/pg-core/index.ts';

// normalized relations carry `refTableRels` back-references, so only the four fields describing the direction of a
// link are compared
const links = (schema: { [key: string]: PgTable }, relations?: AnyRelations) =>
	getSchemaInfo(schema, schema, mapPgColumns, relations).relations.map(
		({ table, columns, refTable, refColumns }) => ({ table, columns, refTable, refColumns }),
	);

const users1 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts1 = pgTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id'), title: text('title') });
const schema1 = { users: users1, posts: posts1 };
const relations1 = defineRelations(schema1, (r) => ({
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));

test('one() declared on the foreign key side points at the referenced table without a constraint', async () => {
	expect(links(schema1, relations1)).toEqual([
		{ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] },
	]);

	const client = new PGlite();
	const db = drizzle({ client });

	await db.execute(sql`create table users (id integer primary key, name text)`);
	await db.execute(sql`create table posts (id integer primary key, owner_id integer, title text)`);

	await seed(db, schema1, { count: 8, relations: relations1 });

	const userRows = await db.select().from(users1);
	const postRows = await db.select().from(posts1);
	const userIds = new Set(userRows.map((user) => user.id));

	expect(postRows.length).toBe(8);
	expect(postRows.every((post) => post.ownerId !== null && userIds.has(post.ownerId))).toBe(true);

	await client.close();
});

const users2 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts2 = pgTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id') });
const schema2 = { users: users2, posts: posts2 };
const relations2 = defineRelations(schema2, (r) => ({
	users: { posts: r.many.posts() },
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));

test('many() declared on the parent yields a single relation, not a cycle', () => {
	const relations = links(schema2, relations2);

	expect(relations.length).toBe(1);
	expect(relations[0]).toEqual({ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] });
});

const users3 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts3 = pgTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id') });
const schema3 = { users: users3, posts: posts3 };
const relations3 = defineRelations(schema3, (r) => ({
	users: { posts: r.many.posts({ from: r.users.id, to: r.posts.ownerId }) },
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));

test('a link spelled out on both sides stays one relation with the child holding the key', () => {
	const relations = links(schema3, relations3);

	expect(relations.length).toBe(1);
	expect(relations[0]).toEqual({ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] });
});

const users4 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const groups4 = pgTable('groups', { id: integer('id').primaryKey(), name: text('name') });
const usersToGroups4 = pgTable('users_to_groups', {
	userId: integer('user_id').notNull(),
	groupId: integer('group_id').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.groupId] })]);
const schema4 = { users: users4, groups: groups4, usersToGroups: usersToGroups4 };
const relations4 = defineRelations(schema4, (r) => ({
	users: { memberships: r.many.usersToGroups({ from: r.users.id, to: r.usersToGroups.userId }) },
}));

test('many({ from, to }) declared only on the parent still makes the other table the child', () => {
	expect(links(schema4, relations4)).toEqual([
		{ table: 'usersToGroups', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);
});

const users5 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts5 = pgTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id') });
const schema5 = { users: users5, posts: posts5 };
const relations5 = defineRelations(schema5, (r) => ({
	users: { posts: r.many.posts({ from: r.users.id, to: r.posts.ownerId }) },
	posts: { owner: r.one.users() },
}));

test('bare one() reverse-derived from the parent many() keeps the foreign key side as the child', () => {
	const relations = links(schema5, relations5);

	expect(relations.length).toBe(1);
	expect(relations[0]).toEqual({ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] });
});

const users6 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts6 = pgTable('posts', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').references(() => users6.id),
});
const schema6 = { users: users6, posts: posts6 };
const childSideRelations6 = defineRelations(schema6, (r) => ({
	posts: { owner: r.one.users({ from: r.posts.ownerId, to: r.users.id }) },
}));
const parentSideRelations6 = defineRelations(schema6, (r) => ({
	users: { posts: r.many.posts({ from: r.users.id, to: r.posts.ownerId }) },
}));

test('a v2 relation duplicating a foreign key constraint adds nothing, declared either way round', () => {
	const constraintOnly = links(schema6);

	expect(constraintOnly).toEqual([
		{ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] },
	]);
	expect(links(schema6, childSideRelations6)).toEqual(constraintOnly);
	expect(links(schema6, parentSideRelations6)).toEqual(constraintOnly);
});

const users7 = pgTable('users', { id: serial('id').primaryKey(), name: text('name') });
const profiles7 = pgTable('profiles', { userId: integer('user_id').primaryKey(), bio: text('bio') });
const schema7 = { users: users7, profiles: profiles7 };
const relations7 = defineRelations(schema7, (r) => ({
	users: { profile: r.one.profiles({ from: r.users.id, to: r.profiles.userId }) },
	profiles: { user: r.one.users({ from: r.profiles.userId, to: r.users.id }) },
}));

test('a shared primary key one-to-one points at the side the database generates', async () => {
	const { relations } = getSchemaInfo(schema7, schema7, mapPgColumns, relations7);

	expect(relations.length).toBe(1);
	expect(relations[0]).toMatchObject({
		table: 'profiles',
		columns: ['userId'],
		refTable: 'users',
		refColumns: ['id'],
	});
	expect(relations[0]!.isCyclic).toBe(false);

	const client = new PGlite();
	const db = drizzle({ client, relations: relations7 });

	await db.execute(sql`create table users (id serial primary key, name text)`);
	await db.execute(sql`create table profiles (user_id integer primary key, bio text)`);

	await seed(db, schema7, { count: 5 });

	const userRows = await db.select().from(users7);
	const profileRows = await db.select().from(profiles7);
	const userIds = new Set(userRows.map((user) => user.id));

	expect(profileRows.length).toBe(5);
	expect(profileRows.every((profile) => userIds.has(profile.userId))).toBe(true);

	await client.close();
});

const users8 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const profiles8 = pgTable('profiles', {
	id: integer('id').primaryKey(),
	userId: integer('user_id').unique(),
	bio: text('bio'),
});
const schema8 = { users: users8, profiles: profiles8 };
const relations8 = defineRelations(schema8, (r) => ({
	users: { profile: r.one.profiles({ from: r.users.id, to: r.profiles.userId }) },
}));

test('a one-to-one declared only on the parent makes the unique side the child', () => {
	expect(links(schema8, relations8)).toEqual([
		{ table: 'profiles', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);
});

const tags9 = pgTable('tags', {
	slug: text('slug').notNull(),
	label: text('label'),
}, (t) => [primaryKey({ columns: [t.slug] })]);
const tagMeta9 = pgTable('tag_meta', { tagSlug: text('tag_slug').notNull().unique(), note: text('note') });
const schema9 = { tags: tags9, tagMeta: tagMeta9 };
const relations9 = defineRelations(schema9, (r) => ({
	tags: { meta: r.one.tagMeta({ from: r.tags.slug, to: r.tagMeta.tagSlug }) },
}));

test('a table level primaryKey() outranks a unique column on the other side', () => {
	const { tables, relations } = getSchemaInfo(schema9, schema9, mapPgColumns, relations9);

	// a table level primary key never marks its columns as primary, so the direction can only come from the table config
	expect(tables.find((table) => table.name === 'tags')!.columns.find((column) => column.name === 'slug')!.primary)
		.toBe(false);

	expect(relations.map(({ table, columns, refTable, refColumns }) => ({ table, columns, refTable, refColumns })))
		.toEqual([
			{ table: 'tagMeta', columns: ['tagSlug'], refTable: 'tags', refColumns: ['slug'] },
		]);
});

const users10 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const messages10 = pgTable('messages', {
	id: integer('id').primaryKey(),
	senderId: integer('sender_id'),
	receiverId: integer('receiver_id'),
	body: text('body'),
});
const schema10 = { users: users10, messages: messages10 };
const relations10 = defineRelations(schema10, (r) => ({
	messages: {
		sender: r.one.users({ from: r.messages.senderId, to: r.users.id, alias: 'sender' }),
		receiver: r.one.users({ from: r.messages.receiverId, to: r.users.id, alias: 'receiver' }),
	},
}));

test('two relations between the same pair of tables both survive', () => {
	expect(links(schema10, relations10)).toEqual([
		{ table: 'messages', columns: ['senderId'], refTable: 'users', refColumns: ['id'] },
		{ table: 'messages', columns: ['receiverId'], refTable: 'users', refColumns: ['id'] },
	]);
});

const users11 = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
const posts11 = pgTable('posts', { id: integer('id').primaryKey(), ownerId: integer('owner_id') });
const schema11 = { users: users11, posts: posts11 };
const relations11 = defineRelations(schema11, (r) => ({
	posts: {
		author: r.one.users({ from: r.posts.ownerId, to: r.users.id, alias: 'author', optional: true }),
		owner: r.one.users({
			from: r.posts.ownerId,
			to: r.users.id,
			alias: 'owner',
			optional: false,
			where: { name: { isNotNull: true } },
		}),
	},
}));

test('the same link declared twice under different aliases collapses to one relation', () => {
	const relations = links(schema11, relations11);

	expect(relations.length).toBe(1);
	expect(relations[0]).toEqual({ table: 'posts', columns: ['ownerId'], refTable: 'users', refColumns: ['id'] });
});

const orgs12 = pgTable('orgs', {
	region: text('region').notNull(),
	code: text('code').notNull(),
	name: text('name'),
}, (t) => [primaryKey({ columns: [t.region, t.code] })]);
const orgMembers12 = pgTable('org_members', {
	id: integer('id').primaryKey(),
	orgRegion: text('org_region').notNull(),
	orgCode: text('org_code').notNull(),
});
const schema12 = { orgs: orgs12, orgMembers: orgMembers12 };
const relations12 = defineRelations(schema12, (r) => ({
	orgMembers: {
		org: r.one.orgs({
			from: [r.orgMembers.orgRegion, r.orgMembers.orgCode],
			to: [r.orgs.region, r.orgs.code],
		}),
	},
}));

test('a composite from/to becomes one relation with both column pairs aligned', () => {
	expect(links(schema12, relations12)).toEqual([
		{ table: 'orgMembers', columns: ['orgRegion', 'orgCode'], refTable: 'orgs', refColumns: ['region', 'code'] },
	]);
});
