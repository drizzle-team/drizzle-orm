import type { Equal } from 'tests/utils';
import { Expect } from 'tests/utils';
import { eq, gt } from '~/expressions';
import { sql } from '~/sql';
import type { InferModel, SQLiteColumn } from '~/sqlite-core';
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from '~/sqlite-core';
import { sqliteView, type SQLiteViewWithSelection } from '~/sqlite-core/view';

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
		pk: primaryKey(users.age1, users.class),
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

export const newYorkers = sqliteView('new_yorkers')
	.as((qb) => {
		const sq = qb
			.$with('sq')
			.as(
				qb.select({ userId: users.id, cityId: cities.id })
					.from(users)
					.leftJoin(cities, eq(cities.id, users.homeCity))
					.where(sql`${users.age1} > 18`),
			);
		return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
	});

Expect<
	Equal<
		SQLiteViewWithSelection<'new_yorkers', false, {
			userId: SQLiteColumn<{
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				tableName: 'new_yorkers';
			}>;
			cityId: SQLiteColumn<{
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				tableName: 'new_yorkers';
			}>;
		}>,
		typeof newYorkers
	>
>;

{
	const newYorkers = sqliteView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	})
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			SQLiteViewWithSelection<'new_yorkers', false, {
				userId: SQLiteColumn<{
					data: number;
					driverParam: number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: SQLiteColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = sqliteView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	}).existing();

	Expect<
		Equal<
			SQLiteViewWithSelection<'new_yorkers', true, {
				userId: SQLiteColumn<{
					data: number;
					driverParam: number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: SQLiteColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}
