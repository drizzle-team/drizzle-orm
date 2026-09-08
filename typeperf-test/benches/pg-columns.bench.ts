/**
 * PostgreSQL columns type performance benchmarks
 *
 * These benchmarks measure the type instantiation cost of various drizzle-orm operations.
 * Run with: tsx benches/pg-columns.bench.ts
 *
 * Baselines reflect optimized drizzle-orm with:
 * - Direct property access in RequiredKeyOnly/OptionalKeyOnly
 * - Variance annotations (out keyword) on Column, ColumnBuilder, PgColumn, PgColumnBuilder, Table, PgTable
 */
import { bench } from '@ark/attest';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Baseline expression - warm up the type checker with a minimal import
// This ensures subsequent benchmarks don't include initial module resolution costs
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
}).types([126, 'instantiations']);

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
}).types([202, 'instantiations']);

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
}).types([541, 'instantiations']);

bench('infer insert model - 5 columns', () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text().notNull(),
		email: text().notNull(),
		active: boolean().default(true),
		createdAt: timestamp().defaultNow(),
	});
	return {} as InferInsertModel<typeof users>;
}).types([1078, 'instantiations']);

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
}).types([915, 'instantiations']);

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
}).types([1411, 'instantiations']);

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
}).types([2043, 'instantiations']);

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
import { defineRelations } from 'drizzle-orm';

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
}).types([1387, 'instantiations']);

bench('rqb - findMany with columns', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.users.findMany({
		columns: {
			id: true,
			name: true,
		},
	});
}).types([1443, 'instantiations']);

bench('rqb - findMany with one relation', () => {
	const db = drizzle({ connection: 'postgres://...', relations });
	return db.query.posts.findMany({
		with: {
			author: true,
		},
	});
}).types([1540, 'instantiations']);

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
}).types([1455, 'instantiations']);

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
}).types([1630, 'instantiations']);

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
}).types([1812, 'instantiations']);

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
}).types([1965, 'instantiations']);
