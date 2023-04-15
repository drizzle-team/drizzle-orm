import { type Equal, Expect } from 'type-tests/utils';
import { eq, gt } from '~/expressions';
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
	longtext,
	mediumtext,
	mysqlEnum,
	type MySqlInt,
	type MySqlSerial,
	mysqlTable,
	primaryKey,
	serial,
	text,
	timestamp,
	tinytext,
	uniqueIndex,
	varchar,
} from '~/mysql-core';
import { mysqlSchema } from '~/mysql-core/schema';
import { mysqlView, type MySqlViewWithSelection } from '~/mysql-core/view';
import { sql } from '~/sql';
import type { InferModel } from '~/table';
import { db } from './db';

export const users = mysqlTable(
	'users_table',
	{
		id: serial('id').primaryKey(),
		homeCity: int('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: int('current_city').references(() => cities.id),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial2').notNull(),
		class: text('class', { enum: ['A', 'C'] }).notNull(),
		subClass: text('sub_class', { enum: ['B', 'D'] }),
		text: text('text'),
		age1: int('age1').notNull(),
		createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
		enumCol: mysqlEnum('enum_col', ['a', 'b', 'c']).notNull(),
	},
	(users) => ({
		usersAge1Idx: uniqueIndex('usersAge1Idx').on(users.class),
		usersAge2Idx: index('usersAge2Idx').on(users.class),
		uniqueClass: uniqueIndex('uniqueClass')
			.on(users.class, users.subClass)
			.lock('default')
			.algorythm('copy')
			.using(`btree`),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey({ columns: [users.subClass], foreignColumns: [classes.subClass] }),
		usersClassComplexFK: foreignKey({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		}),
		pk: primaryKey(users.age1, users.class),
	}),
);

export const cities = mysqlTable('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name_db').notNull(),
	population: int('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx').on(cities.id),
}));

Expect<
	Equal<{
		id: number;
		name_db: string;
		population: number | null;
	}, InferModel<typeof cities, 'select', { dbColumnNames: true }>>
>;

export const customSchema = mysqlSchema('custom_schema');

export const citiesCustom = customSchema.table('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name_db').notNull(),
	population: int('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx').on(cities.id),
}));

Expect<Equal<typeof cities._.columns, typeof citiesCustom._.columns>>;

export const classes = mysqlTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

/* export const classes2 = mysqlTable('classes_table', {
	id: serial().primaryKey(),
	class: text({ enum: ['A', 'C'] }).$dbName('class_db'),
	subClass: text({ enum: ['B', 'D'] }).notNull(),
}); */

export const newYorkers = mysqlView('new_yorkers')
	.algorithm('merge')
	.definer('root@localhost')
	.sqlSecurity('definer')
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
		MySqlViewWithSelection<'new_yorkers', false, {
			userId: MySqlSerial<{
				name: 'id';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				tableName: 'new_yorkers';
			}>;
			cityId: MySqlSerial<{
				name: 'id';
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
	const newYorkers = customSchema.view('new_yorkers')
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
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
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlSerial<{
					name: 'id';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlSerial<{
					name: 'id';
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
}

{
	const newYorkers = mysqlView('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	})
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlSerial<{
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlSerial<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = customSchema.view('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	})
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlInt<{
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlInt<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = mysqlView('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	}).existing();

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', true, {
				userId: MySqlInt<{
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlInt<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = customSchema.view('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	}).existing();

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', true, {
				userId: MySqlInt<{
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlInt<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const customText = customType<{ data: string }>({
		dataType() {
			return 'text';
		},
	});

	const t = customText('name').notNull();
	Expect<
		Equal<{
			name: 'name';
			data: string;
			driverParam: unknown;
			hasDefault: false;
			notNull: true;
		}, typeof t['_']['config']>
	>;
}

{
	const test = mysqlTable('test', {
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
		timestamp: timestamp('timestamp').default(new Date()),
		timestamp2: timestamp('timestamp2', { mode: 'date' }).default(new Date()),
		timestamp3: timestamp('timestamp3', { mode: 'string' }).default('2020-01-01'),
		timestamp4: timestamp('timestamp4', { mode: undefined }).default(new Date()),
	});
}

{
	const test = mysqlTable('test', {
		col1: decimal('col1').default('1'),
	});
}

{
	const test = mysqlTable('test', {
		test1: mysqlEnum('test', ['a', 'b', 'c'] as const),
		test2: mysqlEnum('test', ['a', 'b', 'c']),
		test3: varchar('test', { length: 255, enum: ['a', 'b', 'c'] as const }),
		test4: varchar('test', { length: 255, enum: ['a', 'b', 'c'] }),
		test5: text('test', { enum: ['a', 'b', 'c'] as const }),
		test6: text('test', { enum: ['a', 'b', 'c'] }),
		test7: tinytext('test', { enum: ['a', 'b', 'c'] as const }),
		test8: tinytext('test', { enum: ['a', 'b', 'c'] }),
		test9: mediumtext('test', { enum: ['a', 'b', 'c'] as const }),
		test10: mediumtext('test', { enum: ['a', 'b', 'c'] }),
		test11: longtext('test', { enum: ['a', 'b', 'c'] as const }),
		test12: longtext('test', { enum: ['a', 'b', 'c'] }),
		test13: char('test', { enum: ['a', 'b', 'c'] as const }),
		test14: char('test', { enum: ['a', 'b', 'c'] }),
		test15: text('test'),
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
	function getUsersTable<TSchema extends string>(schemaName: TSchema) {
		return mysqlSchema(schemaName).table('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		});
	}

	const users1 = getUsersTable('id1');
	Expect<Equal<'id1', typeof users1._.schema>>;

	const users2 = getUsersTable('id2');
	Expect<Equal<'id2', typeof users2._.schema>>;
}

{
	const internalStaff = mysqlTable('internal_staff', {
		userId: int('user_id').notNull(),
	});

	const customUser = mysqlTable('custom_user', {
		id: int('id').notNull(),
	});

	const ticket = mysqlTable('ticket', {
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
	const newYorkers = mysqlView('new_yorkers')
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
