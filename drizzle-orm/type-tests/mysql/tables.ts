import * as crypto from 'node:crypto';
import { type Equal, Expect } from 'type-tests/utils.ts';
import type { BuildColumn } from '~/column-builder.ts';
import {
	bigint,
	binary,
	boolean,
	char,
	check,
	customType,
	date,
	datetime,
	decimal,
	double,
	float,
	foreignKey,
	index,
	int,
	json,
	longtext,
	mediumint,
	mediumtext,
	type MySqlColumn,
	mysqlEnum,
	mysqlTable,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	tinytext,
	unique,
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from '~/mysql-core/index.ts';
import { mysqlSchema } from '~/mysql-core/schema.ts';
import { mysqlView, type MySqlViewWithSelection } from '~/mysql-core/view.ts';
import { eq, gt } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { InferSelectModel } from '~/table.ts';
import type { Simplify } from '~/utils.ts';
import { db } from './db.ts';

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
			.algorithm('copy')
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
	Equal<
		{
			id: MySqlColumn<
				{
					name: 'id';
					tableName: 'cities_table';
					dataType: 'number';
					columnType: 'MySqlSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					isPrimaryKey: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isAutoincrement: true;
					hasRuntimeDefault: false;
				},
				{},
				{}
			>;
			name: MySqlColumn<
				{
					name: 'name_db';
					tableName: 'cities_table';
					dataType: 'string';
					columnType: 'MySqlText';
					data: string;
					driverParam: string;
					notNull: true;
					hasDefault: false;
					isPrimaryKey: false;
					enumValues: [string, ...string[]];
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				},
				{},
				{}
			>;
			population: MySqlColumn<
				{
					name: 'population';
					tableName: 'cities_table';
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					notNull: false;
					hasDefault: true;
					isPrimaryKey: false;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				},
				{},
				{}
			>;
		},
		typeof cities._.columns
	>
>;

Expect<
	Equal<{
		id: number;
		name_db: string;
		population: number | null;
	}, InferSelectModel<typeof cities, { dbColumnNames: true }>>
>;

Expect<
	Equal<{
		id?: number;
		name: string;
		population?: number | null;
	}, typeof cities.$inferInsert>
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

export const classes = mysqlTable('classes_table', ({ serial, text }) => ({
	id: serial('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
}));

/* export const classes2 = mysqlTable('classes_table', {
	id: serial().primaryKey(),
	class: text({ enum: ['A', 'C'] }).$dbName('class_db'),
	subClass: text({ enum: ['B', 'D'] }).notNull(),
}); */

export const newYorkers = mysqlView('new_yorkers')
	.algorithm('merge')
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
			userId: MySqlColumn<{
				name: 'id';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				tableName: 'new_yorkers';
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: true;
				hasRuntimeDefault: false;
			}>;
			cityId: MySqlColumn<{
				name: 'id';
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				tableName: 'new_yorkers';
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: true;
				hasRuntimeDefault: false;
			}>;
		}>,
		typeof newYorkers
	>
>;

{
	const newYorkers = customSchema.view('new_yorkers')
		.algorithm('merge')
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
				userId: MySqlColumn<{
					name: 'id';
					dataType: 'number';
					columnType: 'MySqlSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: true;
					hasRuntimeDefault: false;
				}>;
				cityId: MySqlColumn<{
					name: 'id';
					dataType: 'number';
					columnType: 'MySqlSerial';
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: true;
					hasRuntimeDefault: false;
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
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlColumn<{
					name: 'user_id';
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				}>;
				cityId: MySqlColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlColumn<{
					name: 'user_id';
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				}>;
				cityId: MySqlColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
				userId: MySqlColumn<{
					name: 'user_id';
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				}>;
				cityId: MySqlColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
				userId: MySqlColumn<{
					name: 'user_id';
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				}>;
				cityId: MySqlColumn<{
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					dataType: 'number';
					columnType: 'MySqlInt';
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
		Equal<
			{
				brand: 'Column';
				name: 'name';
				tableName: 'table';
				dataType: 'custom';
				columnType: 'MySqlCustomColumn';
				data: string;
				driverParam: unknown;
				notNull: true;
				hasDefault: false;
				enumValues: undefined;
				baseColumn: never;
				dialect: 'mysql';
				generated: undefined;
				identity: undefined;
				isPrimaryKey: false;
				isAutoincrement: false;
				hasRuntimeDefault: false;
			},
			Simplify<BuildColumn<'table', typeof t, 'mysql'>['_']>
		>
	>;
}

{
	mysqlTable('test', {
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
	mysqlTable('test', {
		col1: decimal('col1').default('1'),
	});
}

{
	const test = mysqlTable('test', {
		test1: mysqlEnum('test', ['a', 'b', 'c'] as const).notNull(),
		test2: mysqlEnum('test', ['a', 'b', 'c']).notNull(),
		test3: varchar('test', { length: 255, enum: ['a', 'b', 'c'] as const }).notNull(),
		test4: varchar('test', { length: 255, enum: ['a', 'b', 'c'] }).notNull(),
		test5: text('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test6: text('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test7: tinytext('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test8: tinytext('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test9: mediumtext('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test10: mediumtext('test', { enum: ['a', 'b', 'c'] }).notNull(),
		test11: longtext('test', { enum: ['a', 'b', 'c'] as const }).notNull(),
		test12: longtext('test', { enum: ['a', 'b', 'c'] }).notNull(),
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

{ // All types with generated columns
	const test = mysqlTable('test', {
		test1: mysqlEnum('test', ['a', 'b', 'c'] as const).generatedAlwaysAs(sql``),
		test2: mysqlEnum('test', ['a', 'b', 'c']).generatedAlwaysAs(sql``),
		test3: varchar('test', { length: 255, enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test4: varchar('test', { length: 255, enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test5: text('test', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test6: text('test', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test7: tinytext('test', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test8: tinytext('test', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test9: mediumtext('test', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test10: mediumtext('test', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test11: longtext('test', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test12: longtext('test', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test13: char('test', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		test14: char('test', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		test15: text('test').generatedAlwaysAs(sql``),
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
		return mysqlSchema(schemaName).table('users', {
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

{
	const test = mysqlTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	mysqlTable('test', {
		id: int('id').$default(() => 1),
		id2: int('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: int('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: int('id').$defaultFn(() => '1'),
	});
}
{
	const emailLog = mysqlTable(
		'email_log',
		{
			id: int('id', { unsigned: true }).autoincrement().notNull(),
			clientId: int('id_client', { unsigned: true }).references((): MySqlColumn => emailLog.id, {
				onDelete: 'set null',
				onUpdate: 'cascade',
			}),
			receiverEmail: varchar('receiver_email', { length: 255 }).notNull(),
			messageId: varchar('message_id', { length: 255 }),
			contextId: int('context_id', { unsigned: true }),
			contextType: mysqlEnum('context_type', ['test']).$type<['test']>(),
			action: varchar('action', { length: 80 }).$type<['test']>(),
			events: json('events').$type<{ t: 'test' }[]>(),
			createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
			updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow(),
		},
		(table) => {
			return {
				emailLogId: primaryKey({ columns: [table.id], name: 'email_log_id' }),
				emailLogMessageIdUnique: unique('email_log_message_id_unique').on(table.messageId),
			};
		},
	);

	Expect<
		Equal<{
			receiverEmail: string;
			id?: number | undefined;
			createdAt?: string | undefined;
			clientId?: number | null | undefined;
			messageId?: string | null | undefined;
			contextId?: number | null | undefined;
			contextType?: ['test'] | null | undefined;
			action?: ['test'] | null | undefined;
			events?:
				| {
					t: 'test';
				}[]
				| null
				| undefined;
			updatedAt?: string | null | undefined;
		}, typeof emailLog.$inferInsert>
	>;
}

{
	const customRequiredConfig = customType<{
		data: string;
		driverData: string;
		config: { length: number };
		configRequired: true;
	}>({
		dataType(config) {
			Expect<Equal<{ length: number }, typeof config>>;
			return `varchar(${config.length})`;
		},

		toDriver(value) {
			Expect<Equal<string, typeof value>>();
			return value;
		},

		fromDriver(value) {
			Expect<Equal<string, typeof value>>();
			return value;
		},
	});

	customRequiredConfig('t', { length: 10 });
	customRequiredConfig({ length: 10 });
	// @ts-expect-error - config is required
	customRequiredConfig('t');
	// @ts-expect-error - config is required
	customRequiredConfig();
}

{
	const customOptionalConfig = customType<{
		data: string;
		driverData: string;
		config: { length: number };
	}>({
		dataType(config) {
			Expect<Equal<{ length: number } | undefined, typeof config>>;
			return config ? `varchar(${config.length})` : `text`;
		},

		toDriver(value) {
			Expect<Equal<string, typeof value>>();
			return value;
		},

		fromDriver(value) {
			Expect<Equal<string, typeof value>>();
			return value;
		},
	});

	customOptionalConfig('t', { length: 10 });
	customOptionalConfig('t');
	customOptionalConfig({ length: 10 });
	customOptionalConfig();
}

{
	mysqlTable('all_columns', {
		bigint: bigint('bigint', { mode: 'number' }),
		bigint2: bigint('bigint', { mode: 'number', unsigned: true }),
		bigintdef: bigint('bigintdef', { mode: 'number' }).default(0),
		binary: binary('binary'),
		binary1: binary('binary1', { length: 1 }),
		binarydef: binary('binarydef').default(''),
		boolean: boolean('boolean'),
		booleandef: boolean('booleandef').default(false),
		char: char('char'),
		char2: char('char2', { length: 1 }),
		char3: char('char3', { enum: ['a', 'b', 'c'] }),
		char4: char('char4', { length: 1, enum: ['a', 'b', 'c'] }),
		chardef: char('chardef').default(''),
		date: date('date'),
		date2: date('date2', { mode: 'string' }),
		datedef: date('datedef').default(new Date()),
		datetime: datetime('datetime'),
		datetime2: datetime('datetime2', { mode: 'string' }),
		datetime3: datetime('datetime3', { mode: 'string', fsp: 3 }),
		datetimedef: datetime('datetimedef').default(new Date()),
		decimal: decimal('decimal'),
		decimal2: decimal('decimal2', { precision: 10 }),
		decimal3: decimal('decimal3', { scale: 2 }),
		decimal4: decimal('decimal4', { precision: 10, scale: 2 }),
		decimaldef: decimal('decimaldef').default('0'),
		double: double('double'),
		double2: double('double2', { precision: 10 }),
		double3: double('double3', { scale: 2 }),
		double4: double('double4', { precision: 10, scale: 2 }),
		doubledef: double('doubledef').default(0),
		enum: mysqlEnum('enum', ['a', 'b', 'c']),
		enumdef: mysqlEnum('enumdef', ['a', 'b', 'c']).default('a'),
		float: float('float'),
		float2: float('float2', { precision: 10 }),
		float3: float('float3', { scale: 2 }),
		float4: float('float4', { precision: 10, scale: 2 }),
		floatdef: float('floatdef').default(0),
		int: int('int'),
		int2: int('int2', { unsigned: true }),
		intdef: int('intdef').default(0),
		json: json('json'),
		jsondef: json('jsondef').default({}),
		mediumint: mediumint('mediumint'),
		mediumint2: mediumint('mediumint2', { unsigned: true }),
		mediumintdef: mediumint('mediumintdef').default(0),
		real: real('real'),
		real2: real('real2', { precision: 10 }),
		real3: real('real3', { scale: 2 }),
		real4: real('real4', { precision: 10, scale: 2 }),
		realdef: real('realdef').default(0),
		serial: serial('serial'),
		serialdef: serial('serialdef').default(0),
		smallint: smallint('smallint'),
		smallint2: smallint('smallint2', { unsigned: true }),
		smallintdef: smallint('smallintdef').default(0),
		text: text('text'),
		text2: text('text2', { enum: ['a', 'b', 'c'] }),
		textdef: text('textdef').default(''),
		tinytext: tinytext('tinytext'),
		tinytext2: tinytext('tinytext2', { enum: ['a', 'b', 'c'] }),
		tinytextdef: tinytext('tinytextdef').default(''),
		mediumtext: mediumtext('mediumtext'),
		mediumtext2: mediumtext('mediumtext2', { enum: ['a', 'b', 'c'] }),
		mediumtextdef: mediumtext('mediumtextdef').default(''),
		longtext: longtext('longtext'),
		longtext2: longtext('longtext2', { enum: ['a', 'b', 'c'] }),
		longtextdef: longtext('longtextdef').default(''),
		time: time('time'),
		time2: time('time2', { fsp: 1 }),
		timedef: time('timedef').default('00:00:00'),
		timestamp: timestamp('timestamp'),
		timestamp2: timestamp('timestamp2', { mode: 'string' }),
		timestamp3: timestamp('timestamp3', { mode: 'string', fsp: 1 }),
		timestamp4: timestamp('timestamp4', { fsp: 1 }),
		timestampdef: timestamp('timestampdef').default(new Date()),
		tinyint: tinyint('tinyint'),
		tinyint2: tinyint('tinyint2', { unsigned: true }),
		tinyintdef: tinyint('tinyintdef').default(0),
		varbinary: varbinary('varbinary', { length: 1 }),
		varbinarydef: varbinary('varbinarydef', { length: 1 }).default(''),
		varchar: varchar('varchar', { length: 1 }),
		varchar2: varchar('varchar2', { length: 1, enum: ['a', 'b', 'c'] }),
		varchardef: varchar('varchardef', { length: 1 }).default(''),
		year: year('year'),
		yeardef: year('yeardef').default(0),
	});
}

{
	const keysAsColumnNames = mysqlTable('test', {
		id: int(),
		name: text(),
	});

	Expect<Equal<typeof keysAsColumnNames['id']['_']['name'], 'id'>>;
	Expect<Equal<typeof keysAsColumnNames['name']['_']['name'], 'name'>>;
}

{
	mysqlTable('all_columns_without_name', {
		bigint: bigint({ mode: 'number' }),
		bigint2: bigint({ mode: 'number', unsigned: true }),
		bigintdef: bigint({ mode: 'number' }).default(0),
		binary: binary(),
		binrary1: binary({ length: 1 }),
		binarydef: binary().default(''),
		boolean: boolean(),
		booleandef: boolean().default(false),
		char: char(),
		char2: char({ length: 1 }),
		char3: char({ enum: ['a', 'b', 'c'] }),
		char4: char({ length: 1, enum: ['a', 'b', 'c'] }),
		chardef: char().default(''),
		date: date(),
		date2: date({ mode: 'string' }),
		datedef: date('datedef').default(new Date()),
		datetime: datetime(),
		datetime2: datetime({ mode: 'string' }),
		datetime3: datetime({ mode: 'string', fsp: 3 }),
		datetimedef: datetime('datetimedef').default(new Date()),
		decimal: decimal(),
		decimal2: decimal({ precision: 10 }),
		decimal3: decimal({ scale: 2 }),
		decimal4: decimal({ precision: 10, scale: 2 }),
		decimaldef: decimal('decimaldef').default('0'),
		double: double(),
		double2: double({ precision: 10 }),
		double3: double({ scale: 2 }),
		double4: double({ precision: 10, scale: 2 }),
		doubledef: double().default(0),
		enum: mysqlEnum(['a', 'b', 'c']),
		enumdef: mysqlEnum(['a', 'b', 'c']).default('a'),
		float: float(),
		float2: float({ precision: 10 }),
		float3: float({ scale: 2 }),
		float4: float({ precision: 10, scale: 2 }),
		floatdef: float().default(0),
		int: int(),
		int2: int({ unsigned: true }),
		intdef: int().default(0),
		json: json(),
		jsondef: json().default({}),
		mediumint: mediumint(),
		mediumint2: mediumint({ unsigned: true }),
		mediumintdef: mediumint().default(0),
		real: real(),
		real2: real({ precision: 10 }),
		real3: real({ scale: 2 }),
		real4: real({ precision: 10, scale: 2 }),
		realdef: real().default(0),
		serial: serial(),
		serialdef: serial().default(0),
		smallint: smallint(),
		smallint2: smallint({ unsigned: true }),
		smallintdef: smallint().default(0),
		text: text(),
		text2: text({ enum: ['a', 'b', 'c'] }),
		textdef: text().default(''),
		tinytext: tinytext(),
		tinytext2: tinytext({ enum: ['a', 'b', 'c'] }),
		tinytextdef: tinytext().default(''),
		mediumtext: mediumtext(),
		mediumtext2: mediumtext({ enum: ['a', 'b', 'c'] }),
		mediumtextdef: mediumtext().default(''),
		longtext: longtext(),
		longtext2: longtext({ enum: ['a', 'b', 'c'] }),
		longtextdef: longtext().default(''),
		time: time(),
		time2: time({ fsp: 1 }),
		timedef: time().default('00:00:00'),
		timestamp: timestamp(),
		timestamp2: timestamp({ mode: 'string' }),
		timestamp3: timestamp({ mode: 'string', fsp: 1 }),
		timestamp4: timestamp({ fsp: 1 }),
		timestampdef: timestamp().default(new Date()),
		tinyint: tinyint(),
		tinyint2: tinyint({ unsigned: true }),
		tinyintdef: tinyint().default(0),
		varbinary: varbinary({ length: 1 }),
		varbinarydef: varbinary({ length: 1 }).default(''),
		varchar: varchar({ length: 1 }),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }),
		varchardef: varchar({ length: 1 }).default(''),
		year: year(),
		yeardef: year().default(0),
	});
}

{
	enum Role {
		admin = 'admin',
		user = 'user',
		guest = 'guest',
	}

	enum RoleNonString {
		admin,
		user,
		guest,
	}

	enum RolePartiallyString {
		admin,
		user = 'user',
		guest = 'guest',
	}

	const table = mysqlTable('table', {
		enum: mysqlEnum('enum', Role),
		// @ts-expect-error
		enum1: mysqlEnum('enum1', RoleNonString),
		// @ts-expect-error
		enum2: mysqlEnum('enum2', RolePartiallyString),
	});

	const res = await db.select({ enum: table.enum }).from(table);

	Expect<Equal<{ enum: Role | null }[], typeof res>>;
}
