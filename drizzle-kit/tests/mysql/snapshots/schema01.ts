import {
	AnyMySqlColumn,
	foreignKey,
	int,
	mysqlTable,
	primaryKey,
	serial,
	text,
	unique,
	varchar,
} from 'drizzle-orm/mysql-core';

// TODO: extend massively cc: @OleksiiKH0240
export const users = mysqlTable('users', {
	id: serial().primaryKey(),
	text: varchar({ length: 100 }).unique(),
	text1: varchar({ length: 100 }),
	text2: varchar({ length: 100 }),
}, (t) => [unique().on(t.text1, t.text2)]);

export const users1 = mysqlTable('users1', {
	id1: int(),
	id2: int(),
}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]);

export const users2 = mysqlTable('users2', {
	id: serial(),
	c1: varchar({ length: 100 }).unique(),
	c2: varchar({ length: 100 }).unique('c2unique'),
	c3: varchar({ length: 100 }).unique('c3unique'),
}, (t) => [primaryKey({ columns: [t.id] })]);

export const users3 = mysqlTable('users3', {
	c1: varchar({ length: 100 }),
	c2: varchar({ length: 100 }),
	c3: varchar({ length: 100 }),
}, (t) => [
	unique().on(t.c1),
	unique('u3c2unique').on(t.c2),
	unique('u3c3unique').on(t.c3),
	unique('u3c2c3unique').on(t.c2, t.c3),
]);

export const users4 = mysqlTable('users4', {
	c1: varchar({ length: 100 }).unique().references(() => users3.c1),
	c2: varchar({ length: 100 }).references((): AnyMySqlColumn => users4.c1),
	c3: varchar({ length: 100 }),
	c4: varchar({ length: 100 }),
}, (t) => [foreignKey({ columns: [t.c3, t.c4], foreignColumns: [users3.c2, users3.c3] })]);

export const users5 = mysqlTable('users5', {
	fullName: text(),
});
