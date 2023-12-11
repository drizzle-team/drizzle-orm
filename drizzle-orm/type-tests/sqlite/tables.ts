import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq, gt } from '~/expressions.ts';
import { sql } from '~/sql/sql.ts';
import {
	alias,
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	type SQLiteColumn,
	sqliteTable,
	text,
	uniqueIndex,
} from '~/sqlite-core/index.ts';
import { sqliteView, type SQLiteViewWithSelection } from '~/sqlite-core/view.ts';
import { db } from './db.ts';

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
		class: text('class', { enum: ['A', 'C'] }).notNull(),
		subClass: text('sub_class', { enum: ['B', 'D'] }),
		name: text('name'),
		age1: integer('age1').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
		enumCol: text('enum_col', { enum: ['a', 'b', 'c'] }).notNull(),
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

export type User = typeof users.$inferSelect;
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

export type NewUser = typeof users.$inferInsert;
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

export type City = typeof cities.$inferSelect;
Expect<
	Equal<City, {
		id: number;
		name: string;
		population: number | null;
	}>
>;

export type NewCity = typeof cities.$inferInsert;
Expect<
	Equal<NewCity, {
		id?: number;
		name: string;
		population?: number | null;
	}>
>;

export const classes = sqliteTable('classes_table', {
	id: integer('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

export type Class = typeof classes.$inferSelect;
Expect<
	Equal<Class, {
		id: number;
		class: 'A' | 'C' | null;
		subClass: 'B' | 'D';
	}>
>;

export type NewClass = typeof classes.$inferInsert;
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
				name: 'id';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				tableName: 'new_yorkers';
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
			}>;
			cityId: SQLiteColumn<{
				name: 'id';
				dataType: 'number';
				columnType: 'SQLiteInteger';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				tableName: 'new_yorkers';
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
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
					name: 'user_id';
					dataType: 'number';
					columnType: 'SQLiteInteger';
					data: number;
					driverParam: number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: SQLiteColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'SQLiteInteger';
					data: number;
					driverParam: number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
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
					name: 'user_id';
					dataType: 'number';
					columnType: 'SQLiteInteger';
					data: number;
					driverParam: number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: SQLiteColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'SQLiteInteger';
					data: number;
					driverParam: number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	sqliteTable('test', {
		col1: integer('col1').default(1),
		col2: integer('col2', { mode: 'number' }).default(1),
		col3: integer('col3', { mode: 'timestamp' }).default(new Date()),
		col4: integer('col4', { mode: 'timestamp_ms' }).default(new Date()),
		// @ts-expect-error - invalid mode
		col5: integer('col4', { mode: undefined }).default(new Date()),
	});
}

{
	const internalStaff = sqliteTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = sqliteTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = sqliteTable('ticket', {
		staffId: integer('staff_id').notNull(),
	});

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(
			customUser,
			eq(internalStaff.userId, customUser.id),
		).as('internal_staff');

	const mainQuery = db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId))
		.all();

	Expect<
		Equal<{
			internal_staff: {
				internal_staff: {
					userId: number;
				};
				custom_user: {
					id: number | null;
				};
			} | null;
			ticket: {
				staffId: number;
			};
		}[], typeof mainQuery>
	>;
}

{
	const newYorkers = sqliteView('new_yorkers')
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

	const ny1 = alias(newYorkers, 'ny1');

	const result = db.select().from(newYorkers).leftJoin(ny1, eq(newYorkers.userId, ny1.userId)).all();

	Expect<
		Equal<{
			new_yorkers: {
				userId: number;
				cityId: number | null;
			};
			ny1: {
				userId: number;
				cityId: number | null;
			} | null;
		}[], typeof result>
	>;
}

{
	type Id = number & { __id: true };

	const _table = sqliteTable('test', {
		// @ts-expect-error - type should be Id, not number
		col1: integer('col1').$type<Id>().default(1),
		col2: integer('col2').$type<Id>().default(1 as Id),
	});

	const table = sqliteTable('test', {
		col1: integer('col1').$type<Id>().notNull(),
	});

	Expect<
		Equal<{
			col1: Id;
		}, typeof table.$inferSelect>
	>;
}

{
	const test = sqliteTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	sqliteTable('test', {
		id: integer('id').$default(() => 1),
		id2: integer('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: integer('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: integer('id').$defaultFn(() => '1'),
	});
}

{
	const table = sqliteTable('test', {
		data: text('data', { mode: 'json' }).notNull(),
		dataTyped: text('dataTyped', { mode: 'json' }).$type<{ a: number }>().notNull(),
	});

	Expect<
		Equal<{
			data: unknown;
			dataTyped: { a: number };
		}, typeof table.$inferSelect>
	>;
}
