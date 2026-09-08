import {
	AnySQLiteColumn,
	foreignKey,
	int,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: int().primaryKey(),
	text: text(),
	text1: text(),
	text2: text(),
}, (t) => [uniqueIndex(`users_text1_text2_unique`).on(t.text1, t.text2)]);

export const users1 = sqliteTable('users1', {
	id1: integer(),
	id2: integer(),
}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]);

export const users2 = sqliteTable('users2', {
	id: int(),
	c1: text(),
	c2: text(),
}, (t) => [primaryKey({ columns: [t.id] })]);

export const users3 = sqliteTable('users3', {
	c1: text(),
	c2: text(),
	c3: text(),
}, (t) => [
	uniqueIndex(`name_some`).on(t.c1),
	uniqueIndex('u3c2unique').on(t.c2),
	uniqueIndex('u3c2c3unique').on(t.c2, t.c3),
]);

export const users4 = sqliteTable('users4', {
	c1: text().references(() => users3.c1),
	c2: text().references((): AnySQLiteColumn => users4.c1),
	c3: text(),
	c4: text(),
}, (t) => [foreignKey({ columns: [t.c3, t.c4], foreignColumns: [users3.c2, users3.c3] })]);

export const users5 = sqliteTable('users5', {
	fullName: text(),
});
