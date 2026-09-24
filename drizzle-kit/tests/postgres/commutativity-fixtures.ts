import { sql } from 'drizzle-orm';
import {
	foreignKey,
	index,
	integer,
	pgEnum,
	pgSchema,
	pgTable,
	primaryKey,
	text,
	unique,
	varchar,
} from 'drizzle-orm/pg-core';

/**
 * A fork and the branches it could take, shared by the commutativity comparisons.
 *
 * Every mutation is a whole schema — the state a branch arrives at, not a
 * hand-written statement — so the real diff engine produces the statements and the
 * real database can be driven with the resulting SQL. That is what lets the same
 * scenarios feed the model comparison and the PGlite ground-truth check.
 */
export const mood = pgEnum('mood', ['ok', 'sad']);
export const archive = pgSchema('archive');

const base = { id: integer('id'), email: varchar('email'), state: mood('state') };
const withIx = (t: any) => [index('users_email_ix').on(t.email)];
const T = (cols: Record<string, any>, extra?: (t: any) => any[]) => pgTable('users', cols, extra as any);

export const parent = {
	mood,
	archive,
	users: pgTable('users', base, withIx),
	orders: pgTable('orders', { id: integer('id'), userId: integer('user_id') }),
};

export const mutations: Record<string, any> = {
	'add col age': { ...parent, users: T({ ...base, age: integer('age') }, withIx) },
	'add col nick': { ...parent, users: T({ ...base, nick: varchar('nick') }, withIx) },
	'alter email notNull': { ...parent, users: T({ ...base, email: varchar('email').notNull() }, withIx) },
	'alter email type': { ...parent, users: T({ ...base, email: text('email') }, withIx) },
	'alter email generated': {
		...parent,
		users: T({ ...base, email: varchar('email').generatedAlwaysAs(sql`'x'`) }, withIx),
	},
	'drop col email': { ...parent, users: T({ id: integer('id'), state: mood('state') }) },
	'drop index on email': { ...parent, users: T(base) },
	'add index on id': { ...parent, users: T(base, (t) => [...withIx(t), index('users_id_ix').on(t.id)]) },
	'add pk on id': { ...parent, users: T(base, (t) => [...withIx(t), primaryKey({ columns: [t.id] })]) },
	'add unique on email': { ...parent, users: T(base, (t) => [...withIx(t), unique('users_email_uq').on(t.email)]) },
	'drop table users': { mood, archive, orders: parent.orders },
	'drop enum mood': {
		archive,
		users: T({ id: integer('id'), email: varchar('email') }, withIx),
		orders: parent.orders,
	},
	'touch other table': {
		...parent,
		orders: pgTable('orders', { id: integer('id'), userId: integer('user_id'), note: text('note') }),
	},
	'add fk orders->users': {
		...parent,
		users: pgTable('users', { ...base, id: integer('id').primaryKey() }, withIx),
		orders: pgTable('orders', { id: integer('id'), userId: integer('user_id') }, (t) => [
			foreignKey({ columns: [t.userId], foreignColumns: [parent.users.id], name: 'orders_user_fk' }),
		]),
	},
};

export const NAMES = Object.keys(mutations);

/** Unordered pairs — commutativity is symmetric, so (a,b) and (b,a) are one question. */
export const PAIRS = NAMES.flatMap((a, i) => NAMES.slice(i).map((b) => ({ a, b, name: `${a}  ∥  ${b}` })));
