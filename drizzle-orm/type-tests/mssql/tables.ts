import { type Equal, Expect } from 'type-tests/utils.ts';
import type { InferSelectModel } from '~/index.ts';
import {
	bigint,
	char,
	check,
	customType,
	date,
	datetime,
	decimal,
	foreignKey,
	index,
	int,
	mssqlTable,
	nchar,
	nvarchar,
	primaryKey,
	text,
	uniqueIndex,
	varchar,
} from '~/mssql-core/index.ts';
import { mssqlSchema } from '~/mssql-core/schema.ts';
import { mssqlView } from '~/mssql-core/view.ts';
import { eq } from '~/sql/expressions';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

export const users = mssqlTable(
	'users_table',
	{
		id: int('id').identity().primaryKey(),
		homeCity: int('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: int('current_city').references(() => cities.id),
		serialNullable: int('serial1').identity(),
		serialNotNull: int('serial2').identity(),
		class: text('class', { enum: ['A', 'C'] }).notNull(),
		subClass: text('sub_class', { enum: ['B', 'D'] }),
		text: text('text'),
		age1: int('age1').notNull(),
		createdAt: datetime('created_at', { mode: 'date' }).default(sql`current_timestamp`).notNull(),
		enumCol: text('enum_col', { enum: ['a', 'b', 'c'] }).notNull(),
	},
	(users) => [
		uniqueIndex('usersAge1Idx').on(users.class),
		index('usersAge2Idx').on(users.class),
		uniqueIndex('uniqueClass')
			.on(users.class, users.subClass),
		check('legalAge', sql`${users.age1} > 18`),
		foreignKey({ name: 'fk_1', columns: [users.subClass], foreignColumns: [classes.subClass] }),
		foreignKey({
			name: 'fk_2',
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		}),
		primaryKey({ columns: [users.age1, users.class], name: 'custom_name' }),
	],
);

export const cities = mssqlTable('cities_table', {
	id: int('id').identity().primaryKey(),
	name: text('name_db').notNull(),
	population: int('population').default(0),
}, (cities) => [
	index('citiesNameIdx').on(cities.id),
]);

Expect<
	Equal<{
		id: number;
		name: string;
		population: number | null;
	}, InferSelectModel<typeof cities>>
>;

export const customSchema = mssqlSchema('custom_schema');

export const citiesCustom = customSchema.table('cities_table', {
	id: int('id').identity().primaryKey(),
	name: text('name_db').notNull(),
	population: int('population').default(0),
}, (cities) => [
	index('citiesNameIdx').on(cities.id),
]);

export const classes = mssqlTable('classes_table', {
	id: int('id').identity().primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

/* export const classes2 = mssqlTable('classes_table', {
	id: serial().primaryKey(),
	class: text({ enum: ['A', 'C'] }).$dbName('class_db'),
	subClass: text({ enum: ['B', 'D'] }).notNull(),
}); */

export const newYorkers = mssqlView('new_yorkers')
	.with({ checkOption: true, encryption: false, schemaBinding: true, viewMetadata: false })
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

{
	mssqlTable('test', {
		bigint: bigint('bigint', { mode: 'bigint' }),
		number: bigint('number', { mode: 'number' }),
		date: date('date').default(new Date()),
		date2: date('date2', { mode: 'date' }).default(new Date()),
		date3: date('date3', { mode: 'string' }).default('2020-01-01'),
		date4: date('date4', { mode: undefined }).default(new Date()),
		datetime: datetime('datetime').default(new Date()),
		datetime2: datetime('datetime2', { mode: 'date' }).default(new Date()),
		datetime3: datetime('datetime3', { mode: 'string' }).default('2020-01-01'),
		datetime4: datetime('datetime4', { mode: undefined }).default(new Date()),
	});
}

{
	mssqlTable('test', {
		col1: decimal('col1').default('1'),
	});
}

{
	const test = mssqlTable('test', {
		test1: text('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test2: varchar('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test3: varchar('test', { length: 255, enum: ['a', 'b', 'c'] as const }).notNull(),
		test4: varchar('test', { length: 255, enum: ['a', 'b', 'c'] }).notNull(),
		test5: text('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test6: text('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test7: nvarchar('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test8: nvarchar('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test9: char('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test10: char('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test11: nchar('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test12: nchar('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test13: char('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test14: char('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test15: text('test').notNull(),
	});
	Expect<Equal<['a', 'b', 'c'], typeof test.test1.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test2.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test3.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test4.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test5.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test6.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test7.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test8.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test9.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test10.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test11.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test12.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test13.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.test14.enumValues>>;
	Expect<Equal<[string, ...string[]], typeof test.test15.enumValues>>;
}

{
	const getUsersTable = <TSchema extends string>(schemaName: TSchema) => {
		return mssqlSchema(schemaName).table('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});
	};

	const users1 = getUsersTable('id1');
	Expect<Equal<'id1', typeof users1._.schema>>;

	const users2 = getUsersTable('id2');
	Expect<Equal<'id2', typeof users2._.schema>>;
}

{
	const internalStaff = mssqlTable('internal_staff', {
		userId: int('user_id').notNull(),
	});

	const customUser = mssqlTable('custom_user', {
		id: int('id').notNull(),
	});

	const ticket = mssqlTable('ticket', {
		staffId: int('staff_id').notNull(),
	});

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(
			customUser,
			eq(internalStaff.userId, customUser.id),
		).as('internal_staff');

	const mainQuery = await db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId));

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
	const newYorkers = mssqlView('new_yorkers')
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

	await db.select().from(newYorkers).leftJoin(newYorkers, eq(newYorkers.userId, newYorkers.userId));
}

{
	const test = mssqlTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	mssqlTable('test', {
		id: int('id').$default(() => 1),
		id2: int('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: int('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: int('id').$defaultFn(() => '1'),
	});
}
