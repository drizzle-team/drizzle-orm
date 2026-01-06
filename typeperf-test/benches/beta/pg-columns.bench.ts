/**
 * PostgreSQL columns type performance benchmarks - BETA VERSION
 *
 * This is a mirror of ../pg-columns.bench.ts but using drizzle-beta.
 * Run this to capture/update baseline values for the main benchmark.
 *
 * Run with: tsx benches/beta/pg-columns.bench.ts
 */
import { bench } from '@ark/attest';
import type { InferInsertModel, InferSelectModel } from 'drizzle-beta';
import { eq } from 'drizzle-beta';
import { drizzle } from 'drizzle-beta/node-postgres';
import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-beta/pg-core';

// Baseline expression - warm up the type checker
pgTable('baseline', { id: integer() });

// --- Table Definition Benchmarks ---

bench('pg table - 5 columns with modifiers', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	return {} as typeof users;
}).types([471, 'instantiations']);

bench('pg table - 10 columns', () => {
	const table = pgTable('table_10_cols', {
		id: integer().primaryKey(),
		uuid: uuid().notNull(),
		name: text().notNull(),
		email: varchar({ length: 255 }).notNull(),
		bio: text(),
		active: boolean().default(true),
		role: text().default('user'),
		createdAt: timestamp().defaultNow(),
		updatedAt: timestamp(),
		deletedAt: timestamp(),
	});
	return {} as typeof table;
}).types([907, 'instantiations']);

// --- Type Inference Benchmarks ---

bench('infer select model - 5 columns', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	return {} as InferSelectModel<typeof users>;
}).types([5418, 'instantiations']);

bench('infer insert model - 5 columns', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	return {} as InferInsertModel<typeof users>;
}).types([5478, 'instantiations']);

// --- Query Benchmarks ---

bench('select query - simple', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	const db = drizzle({ connection: 'postgres://...' });
	return db.select().from(users);
}).types([7132, 'instantiations']);

bench('insert query - simple', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	const db = drizzle({ connection: 'postgres://...' });
	return db.insert(users).values({ id: 1, name: 'test', email: 'test@test.com' });
}).types([8176, 'instantiations']);

bench('update query - simple', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	const db = drizzle({ connection: 'postgres://...' });
	return db.update(users).set({ name: 'updated' }).where(eq(users.id, 1));
}).types([7518, 'instantiations']);

// --- Relational Query Benchmarks ---

// Schema for relational queries
const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
});

const posts = pgTable('posts', {
	id: integer().primaryKey(),
	title: text().notNull(),
	content: text(),
	authorId: integer().notNull(),
});

const comments = pgTable('comments', {
	id: integer().primaryKey(),
	text: text().notNull(),
	postId: integer().notNull(),
	authorId: integer().notNull(),
});

// Define relations
import { defineRelations } from 'drizzle-beta';

const schema = { users, posts, comments };

const relations = defineRelations(schema, (r) => ({
	users: {
		posts: r.many.posts({
			from: r.users.id,
			to: r.posts.authorId,
		}),
		comments: r.many.comments({
			from: r.users.id,
			to: r.comments.authorId,
		}),
	},
	posts: {
		author: r.one.users({
			from: r.posts.authorId,
			to: r.users.id,
		}),
		comments: r.many.comments({
			from: r.posts.id,
			to: r.comments.postId,
		}),
	},
	comments: {
		post: r.one.posts({
			from: r.comments.postId,
			to: r.posts.id,
		}),
		author: r.one.users({
			from: r.comments.authorId,
			to: r.users.id,
		}),
	},
}));

bench('rqb - findMany simple', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findMany();
}).types([1430, 'instantiations']);

bench('rqb - findMany with columns', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findMany({
		columns: {
			id: true,
			name: true,
		},
	});
}).types([1532, 'instantiations']);

bench('rqb - findMany with one relation', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.posts.findMany({
		with: {
			author: true,
		},
	});
}).types([3491, 'instantiations']);

bench('rqb - findMany with nested relations', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findMany({
		with: {
			posts: {
				with: {
					comments: true,
				},
			},
		},
	});
}).types([2713, 'instantiations']);

bench('rqb - findFirst with where', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findFirst({
		where: {
			id: 1,
		},
		with: {
			posts: true,
		},
	});
}).types([2547, 'instantiations']);

// --- Relational Query Benchmarks (with inline table definitions) ---

bench('rqb inline - findMany simple', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
	});

	const posts = pgTable('posts', {
		id: integer().primaryKey(),
		title: text().notNull(),
		content: text(),
		authorId: integer().notNull(),
	});

	const schema = { users, posts };

	const relations = defineRelations(schema, (r) => ({
		users: {
			posts: r.many.posts({
				from: r.users.id,
				to: r.posts.authorId,
			}),
		},
		posts: {
			author: r.one.users({
				from: r.posts.authorId,
				to: r.users.id,
			}),
		},
	}));

	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findMany();
}).types([5130, 'instantiations']);

bench('rqb inline - findMany with relation', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
	});

	const posts = pgTable('posts', {
		id: integer().primaryKey(),
		title: text().notNull(),
		content: text(),
		authorId: integer().notNull(),
	});

	const schema = { users, posts };

	const relations = defineRelations(schema, (r) => ({
		users: {
			posts: r.many.posts({
				from: r.users.id,
				to: r.posts.authorId,
			}),
		},
		posts: {
			author: r.one.users({
				from: r.posts.authorId,
				to: r.users.id,
			}),
		},
	}));

	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.posts.findMany({
		with: {
			author: true,
		},
	});
}).types([7168, 'instantiations']);
