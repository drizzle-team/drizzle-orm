import crypto from 'node:crypto';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { z } from 'zod';
import { eq, gt } from '~/expressions.ts';
import {
	bigint,
	bigserial,
	boolean,
	char,
	check,
	cidr,
	customType,
	date,
	decimal,
	doublePrecision,
	foreignKey,
	index,
	inet,
	integer,
	json,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	type PgColumn,
	pgEnum,
	pgTable,
	type PgTableWithColumns,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from '~/pg-core/index.ts';
import { pgSchema } from '~/pg-core/schema.ts';
import {
	pgMaterializedView,
	type PgMaterializedViewWithSelection,
	pgView,
	type PgViewWithSelection,
} from '~/pg-core/view.ts';
import { sql } from '~/sql/sql.ts';
import type { InferInsertModel, InferSelectModel } from '~/table.ts';
import { db } from './db.ts';

export const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);

export const users = pgTable(
	'users_table',
	{
		id: serial('id').primaryKey(),
		uuid: uuid('uuid').defaultRandom().notNull(),
		homeCity: integer('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: integer('current_city').references(() => cities.id),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial2').notNull(),
		class: text('class', { enum: ['A', 'C'] }).notNull(),
		subClass: text('sub_class', { enum: ['B', 'D'] }),
		text: text('text'),
		age1: integer('age1').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		enumCol: myEnum('enum_col').notNull(),
		arrayCol: text('array_col').array().notNull(),
	},
	(users) => ({
		usersAge1Idx: uniqueIndex('usersAge1Idx').on(users.class),
		usersAge2Idx: index('usersAge2Idx').on(users.class),
		uniqueClass: uniqueIndex('uniqueClass')
			.on(users.class, users.subClass)
			.where(sql`${users.class} is not null`)
			.desc()
			.nullsLast()
			.concurrently()
			.using(sql`btree`),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey({ columns: [users.subClass], foreignColumns: [classes.subClass] })
			.onUpdate('cascade')
			.onDelete('cascade'),
		usersClassComplexFK: foreignKey({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		}),
		pk: primaryKey(users.age1, users.class),
	}),
);

Expect<Equal<InferSelectModel<typeof users>, typeof users['$inferSelect']>>;
Expect<Equal<InferSelectModel<typeof users>, typeof users['_']['inferSelect']>>;
Expect<Equal<InferInsertModel<typeof users>, typeof users['$inferInsert']>>;
Expect<Equal<InferInsertModel<typeof users>, typeof users['_']['inferInsert']>>;

export const cities = pgTable('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
}, (cities) => ({
	citiesNameIdx: index().on(cities.id),
}));

export const classes = pgTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

export const network = pgTable('network_table', {
	inet: inet('inet').notNull(),
	cidr: cidr('cidr').notNull(),
	macaddr: macaddr('macaddr').notNull(),
	macaddr8: macaddr8('macaddr8').notNull(),
});

Expect<
	Equal<{
		inet: string;
		cidr: string;
		macaddr: string;
		macaddr8: string;
	}, typeof network.$inferSelect>
>;

export const salEmp = pgTable('sal_emp', {
	name: text('name').notNull(),
	payByQuarter: integer('pay_by_quarter').array().notNull(),
	schedule: text('schedule').array().array().notNull(),
});

export const tictactoe = pgTable('tictactoe', {
	squares: integer('squares').array(3).array(3).notNull(),
});

export const customSchema = pgSchema('custom');

export const citiesCustom = customSchema.table('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
}, (cities) => ({
	citiesNameIdx: index().on(cities.id),
}));

export const newYorkers = pgView('new_yorkers')
	.with({
		checkOption: 'cascaded',
		securityBarrier: true,
		securityInvoker: true,
	})
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
		PgViewWithSelection<'new_yorkers', false, {
			userId: PgColumn<{
				tableName: 'new_yorkers';
				name: 'id';
				dataType: 'number';
				columnType: 'PgSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
			}>;
			cityId: PgColumn<{
				tableName: 'new_yorkers';
				name: 'id';
				dataType: 'number';
				columnType: 'PgSerial';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
			}>;
		}>,
		typeof newYorkers
	>
>;

{
	const newYorkers = customSchema.view('new_yorkers')
		.with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		})
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
			PgViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'id';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'id';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
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
	const newYorkers = pgView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	})
		.with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		})
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			PgViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
	const newYorkers = customSchema.view('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	})
		.with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		})
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			PgViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
	const newYorkers = pgView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	}).existing();

	Expect<
		Equal<
			PgViewWithSelection<'new_yorkers', true, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
	const newYorkers = customSchema.view('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	}).existing();

	Expect<
		Equal<
			PgViewWithSelection<'new_yorkers', true, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

export const newYorkers2 = pgMaterializedView('new_yorkers')
	.using('btree')
	.with({
		fillfactor: 90,
		toast_tuple_target: 0.5,
		autovacuum_enabled: true,
	})
	.tablespace('custom_tablespace')
	.withNoData()
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
		PgMaterializedViewWithSelection<'new_yorkers', false, {
			userId: PgColumn<{
				tableName: 'new_yorkers';
				name: 'id';
				dataType: 'number';
				columnType: 'PgSerial';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
			}>;
			cityId: PgColumn<{
				tableName: 'new_yorkers';
				name: 'id';
				dataType: 'number';
				columnType: 'PgSerial';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
			}>;
		}>,
		typeof newYorkers2
	>
>;

{
	const newYorkers2 = customSchema.materializedView('new_yorkers')
		.using('btree')
		.with({
			fillfactor: 90,
			toast_tuple_target: 0.5,
			autovacuum_enabled: true,
		})
		.tablespace('custom_tablespace')
		.withNoData()
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
			PgMaterializedViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'id';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'id';
					dataType: 'number';
					columnType: 'PgSerial';
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers2
		>
	>;
}

{
	const newYorkers2 = pgMaterializedView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	})
		.using('btree')
		.with({
			fillfactor: 90,
			toast_tuple_target: 0.5,
			autovacuum_enabled: true,
		})
		.tablespace('custom_tablespace')
		.withNoData()
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			PgMaterializedViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers2
		>
	>;
}

{
	const newYorkers2 = customSchema.materializedView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	})
		.using('btree')
		.with({
			fillfactor: 90,
			toast_tuple_target: 0.5,
			autovacuum_enabled: true,
		})
		.tablespace('custom_tablespace')
		.withNoData()
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			PgMaterializedViewWithSelection<'new_yorkers', false, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers2
		>
	>;
}

{
	const newYorkers2 = pgMaterializedView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	}).existing();

	Expect<
		Equal<
			PgMaterializedViewWithSelection<'new_yorkers', true, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers2
		>
	>;
}

{
	const newYorkers2 = customSchema.materializedView('new_yorkers', {
		userId: integer('user_id').notNull(),
		cityId: integer('city_id'),
	}).existing();

	Expect<
		Equal<
			PgMaterializedViewWithSelection<'new_yorkers', true, {
				userId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'user_id';
					dataType: 'number';
					columnType: 'PgInteger';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
				cityId: PgColumn<{
					tableName: 'new_yorkers';
					name: 'city_id';
					dataType: 'number';
					columnType: 'PgInteger';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					enumValues: undefined;
					baseColumn: never;
					generated: undefined;
				}>;
			}>,
			typeof newYorkers2
		>
	>;
}

await db.refreshMaterializedView(newYorkers2).concurrently();
await db.refreshMaterializedView(newYorkers2).withNoData();
await db.refreshMaterializedView(newYorkers2).concurrently().withNoData();
await db.refreshMaterializedView(newYorkers2).withNoData().concurrently();

// await migrate(db, {
// 	migrationsFolder: './drizzle/pg',
// 	onMigrationError(error) {
// 		if (['0001_drizli_klaud', '0002_beep_boop'].includes(error.migration.name)) {
// 			return;
// 		}
// 		throw error;
// 	},
// });

{
	const customTextRequired = customType<{
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

	customTextRequired('t', { length: 10 });
	// @ts-expect-error - config is required
	customTextRequired('t');
}

{
	const customTextOptional = customType<{
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

	customTextOptional('t', { length: 10 });
	customTextOptional('t');
}

{
	const cities = pgTable('cities_table', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		population: integer('population').default(0),
	});

	Expect<
		Equal<
			PgTableWithColumns<{
				name: 'cities_table';
				schema: undefined;
				dialect: 'pg';
				columns: {
					id: PgColumn<{
						tableName: 'cities_table';
						name: 'id';
						dataType: 'number';
						columnType: 'PgSerial';
						data: number;
						driverParam: number;
						hasDefault: true;
						notNull: true;
						enumValues: undefined;
						baseColumn: never;
						generated: undefined;
					}>;
					name: PgColumn<{
						tableName: 'cities_table';
						name: 'name';
						dataType: 'string';
						columnType: 'PgText';
						data: string;
						driverParam: string;
						hasDefault: false;
						enumValues: [string, ...string[]];
						notNull: true;
						baseColumn: never;
						generated: undefined;
					}>;
					role: PgColumn<{
						tableName: 'cities_table';
						name: 'role';
						dataType: 'string';
						columnType: 'PgText';
						data: 'admin' | 'user';
						driverParam: string;
						hasDefault: true;
						enumValues: ['admin', 'user'];
						notNull: true;
						baseColumn: never;
						generated: undefined;
					}>;
					population: PgColumn<{
						tableName: 'cities_table';
						name: 'population';
						dataType: 'number';
						columnType: 'PgInteger';
						data: number;
						driverParam: string | number;
						notNull: false;
						hasDefault: true;
						enumValues: undefined;
						baseColumn: never;
						generated: undefined;
					}>;
				};
			}>,
			typeof cities
		>
	>;
}

{
	pgTable('test', {
		bigint: bigint('bigint', { mode: 'bigint' }).default(BigInt(10)),
		bigintNumber: bigint('bigintNumber', { mode: 'number' }),
		bigserial: bigserial('bigserial', { mode: 'bigint' }).default(BigInt(10)),
		bigserialNumber: bigserial('bigserialNumber', { mode: 'number' }),
		timestamp: timestamp('timestamp').default(new Date()),
		timestamp2: timestamp('timestamp2', { mode: 'date' }).default(new Date()),
		timestamp3: timestamp('timestamp3', { mode: undefined }).default(new Date()),
		timestamp4: timestamp('timestamp4', { mode: 'string' }).default('2020-01-01'),
	});
}

{
	const test = pgTable('test', {
		col1: decimal('col1', { precision: 10, scale: 2 }).notNull().default('10.2'),
	});
	Expect<Equal<{ col1: string }, typeof test.$inferSelect>>;
}

{
	const a = ['a', 'b', 'c'] as const;
	const b = pgEnum('test', a);
	z.enum(b.enumValues);
}

{
	const b = pgEnum('test', ['a', 'b', 'c']);
	z.enum(b.enumValues);
}

{
	const getUsersTable = <TSchema extends string>(schemaName: TSchema) => {
		return pgSchema(schemaName).table('users', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
		});
	};

	const users1 = getUsersTable('id1');
	Expect<Equal<'id1', typeof users1._.schema>>;

	const users2 = getUsersTable('id2');
	Expect<Equal<'id2', typeof users2._.schema>>;
}

{
	const internalStaff = pgTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = pgTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = pgTable('ticket', {
		staffId: integer('staff_id').notNull(),
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
	const newYorkers = pgView('new_yorkers')
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
	const e1 = pgEnum('test', ['a', 'b', 'c']);
	const e2 = pgEnum('test', ['a', 'b', 'c'] as const);

	const test = pgTable('test', {
		col1: char('col1', { enum: ['a', 'b', 'c'] as const }),
		col2: char('col2', { enum: ['a', 'b', 'c'] }),
		col3: char('col3'),
		col4: e1('col4'),
		col5: e2('col5'),
		col6: text('col6', { enum: ['a', 'b', 'c'] as const }),
		col7: text('col7', { enum: ['a', 'b', 'c'] }),
		col8: text('col8'),
		col9: varchar('col9', { enum: ['a', 'b', 'c'] as const }),
		col10: varchar('col10', { enum: ['a', 'b', 'c'] }),
		col11: varchar('col11'),
	});

	Expect<Equal<['a', 'b', 'c'], typeof test.col1.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col2.enumValues>>;
	Expect<Equal<[string, ...string[]], typeof test.col3.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col4.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col5.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col6.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col7.enumValues>>;
	Expect<Equal<[string, ...string[]], typeof test.col8.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col9.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col10.enumValues>>;
	Expect<Equal<[string, ...string[]], typeof test.col11.enumValues>>;
}

{
	const test = pgTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	pgTable('test', {
		id: integer('id').$default(() => 1),
		id2: integer('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: integer('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: integer('id').$defaultFn(() => '1'),
	});
}

{
	pgTable('all_columns', {
		sm: smallint('smallint'),
		smdef: smallint('smallint_def').default(10),
		int: integer('integer'),
		intdef: integer('integer_def').default(10),
		numeric: numeric('numeric'),
		numeric2: numeric('numeric2', { precision: 5 }),
		numeric3: numeric('numeric3', { scale: 2 }),
		numeric4: numeric('numeric4', { precision: 5, scale: 2 }),
		numericdef: numeric('numeridef').default('100'),
		bigint: bigint('bigint', { mode: 'number' }),
		bigintdef: bigint('bigintdef', { mode: 'number' }).default(100),
		bool: boolean('boolean'),
		booldef: boolean('boolean_def').default(true),
		text: text('text'),
		textdef: text('textdef').default('text'),
		varchar: varchar('varchar'),
		varchardef: varchar('varchardef').default('text'),
		serial: serial('serial'),
		bigserial: bigserial('bigserial', { mode: 'number' }),
		decimal: decimal('decimal', { precision: 100, scale: 2 }),
		decimaldef: decimal('decimaldef', { precision: 100, scale: 2 }).default('100.0'),
		doublePrecision: doublePrecision('doublePrecision'),
		doublePrecisiondef: doublePrecision('doublePrecisiondef').default(100),
		real: real('real'),
		realdef: real('realdef').default(100),
		json: json('json').$type<{ attr: string }>(),
		jsondef: json('jsondef').$type<{ attr: string }>().default({ attr: 'value' }),
		jsonb: jsonb('jsonb').$type<{ attr: string }>(),
		jsonbdef: jsonb('jsonbdef').$type<{ attr: string }>().default({ attr: 'value' }),
		time: time('time'),
		time2: time('time2', { precision: 6, withTimezone: true }),
		timedefnow: time('timedefnow').defaultNow(),
		timestamp: timestamp('timestamp'),
		timestamp2: timestamp('timestamp2', { precision: 6, withTimezone: true }),
		timestamp3: timestamp('timestamp3', { withTimezone: true }),
		timestamp4: timestamp('timestamp4', { precision: 4 }),
		timestampdef: timestamp('timestampdef').defaultNow(),
		date: date('date', { mode: 'date' }),
		datedef: date('datedef').defaultNow(),
	});
}
