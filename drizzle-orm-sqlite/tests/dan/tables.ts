import { sql } from 'drizzle-orm';
import { Equal, Expect } from 'tests/utils';

import { check } from '~/checks';
import { foreignKey } from '~/foreign-keys';
import { integer, text } from '~/index';
import { index, uniqueIndex } from '~/indexes';
import { InferModel, sqliteTable } from '~/table';

export const users = sqliteTable(
	'users_table',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		homeCity: integer('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: integer('current_city').references(() => cities.id),
		serialNullable: integer('serial1'),
		serialNotNull: integer('serial2').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text<'B' | 'D'>('sub_class'),
		name: text('name'),
		age1: integer('age1').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
		enumCol: text<'a' | 'b' | 'c'>('enum_col').notNull(),
	},
	(users) => ({
		usersAge1Idx: uniqueIndex('usersAge1Idx').on(users.class),
		usersAge2Idx: index('usersAge2Idx').on(users.class),
		uniqueClass: uniqueIndex('uniqueClass')
			.on(users.class, users.subClass)
			.where(
				sql`${users.class} is not null`,
			),
		uniqueClassEvenBetterThanPrisma: uniqueIndex('uniqueClass')
			.on(users.class, users.subClass)
			.where(
				sql`${users.class} is not null`,
			),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey(() => ({ columns: [users.subClass], foreignColumns: [classes.subClass] })),
		usersClassComplexFK: foreignKey(() => ({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		})),
	}),
);

export type User = InferModel<typeof users>;
Expect<
	Equal<User, {
		id: number;
		homeCity: number;
		currentCity: number | null;
		serialNullable: number | null;
		serialNotNull: number;
		class: 'A' | 'C';
		subClass: 'B' | 'D' | null;
		name: string | null;
		age1: number;
		createdAt: Date;
		enumCol: 'a' | 'b' | 'c';
	}>
>;

export type NewUser = InferModel<typeof users, 'insert'>;
Expect<
	Equal<NewUser, {
		id?: number;
		homeCity: number;
		currentCity?: number | null;
		serialNullable?: number | null;
		serialNotNull: number;
		class: 'A' | 'C';
		subClass?: 'B' | 'D' | null;
		name?: string | null;
		age1: number;
		createdAt?: Date;
		enumCol: 'a' | 'b' | 'c';
	}>
>;

export const cities = sqliteTable('cities_table', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
});

export type City = InferModel<typeof cities>;
Expect<
	Equal<City, {
		id: number;
		name: string;
		population: number | null;
	}>
>;

export type NewCity = InferModel<typeof cities, 'insert'>;
Expect<
	Equal<NewCity, {
		id?: number;
		name: string;
		population?: number | null;
	}>
>;

export const classes = sqliteTable('classes_table', {
	id: integer('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});

export type Class = InferModel<typeof classes>;
Expect<
	Equal<Class, {
		id: number;
		class: 'A' | 'C' | null;
		subClass: 'B' | 'D';
	}>
>;

export type NewClass = InferModel<typeof classes, 'insert'>;
Expect<
	Equal<NewClass, {
		id?: number;
		class?: 'A' | 'C' | null;
		subClass: 'B' | 'D';
	}>
>;
