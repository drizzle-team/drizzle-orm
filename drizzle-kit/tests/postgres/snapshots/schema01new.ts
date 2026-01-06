import {
	AnyPgColumn,
	foreignKey,
	integer,
	pgEnum,
	pgSchema,
	pgTable,
	primaryKey,
	serial,
	text,
	unique,
} from 'drizzle-orm/pg-core';

enum E {
	value = 'value',
}

export const folder = pgSchema('folder');
export const en = pgEnum('e', E);
export const users = pgTable('users', {
	id: serial().primaryKey(),
	enum: en(),
	text: text().unique(),
	text1: text(),
	text2: text(),
}, (t) => [unique().on(t.text1, t.text2)]);

export const users1 = pgTable('users1', {
	id1: integer(),
	id2: integer(),
}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]);

export const users2 = pgTable('users2', {
	id: serial(),
	c1: text().unique(),
	c2: text().unique('c2unique'),
	c3: text().unique('c3unique', { nulls: 'distinct' }),
}, (t) => [primaryKey({ columns: [t.id] })]);

export const users3 = pgTable('users3', {
	c1: text(),
	c2: text(),
	c3: text(),
}, (t) => [
	unique().on(t.c1),
	unique('u3c2unique').on(t.c2),
	unique('u3c3unique').on(t.c3).nullsNotDistinct(),
	unique('u3c2c3unique').on(t.c2, t.c3),
]);

export const users4 = pgTable('users4', {
	c1: text().unique().references(() => users3.c1),
	c2: text().references((): AnyPgColumn => users4.c1),
	c3: text(),
	c4: text(),
	c5: text().array().default([]),
	c6: text().array('[][]').default([[]]),
	c7: text().array('[][][]').default([[[]]]),
	c8: text().array('[][]'),
}, (t) => [foreignKey({ columns: [t.c3, t.c4], foreignColumns: [users3.c2, users3.c3] })]);

export const users5 = pgTable('users5', {
	fullName: text(),
});
