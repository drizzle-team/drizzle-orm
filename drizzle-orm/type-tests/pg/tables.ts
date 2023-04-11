import type { Equal } from 'type-tests/utils';
import { Expect } from 'type-tests/utils';
import { z } from 'zod';
import { eq, gt } from '~/expressions';
import {
	bigint,
	bigserial,
	customType,
	decimal,
	type PgInteger,
	type PgSerial,
	type PgTableWithColumns,
	type PgText,
} from '~/pg-core';
import {
	check,
	cidr,
	foreignKey,
	index,
	inet,
	integer,
	macaddr,
	macaddr8,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from '~/pg-core';
import { pgSchema } from '~/pg-core/schema';
import {
	pgMaterializedView,
	type PgMaterializedViewWithSelection,
	pgView,
	type PgViewWithSelection,
} from '~/pg-core/view';
import { sql } from '~/sql';
import type { InferModel } from '~/table';
import { db } from './db';

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
	}, InferModel<typeof network>>
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
			userId: PgSerial<{
				tableName: 'new_yorkers';
				name: 'id';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
			}>;
			cityId: PgSerial<{
				tableName: 'new_yorkers';
				name: 'id';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
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
				userId: PgSerial<{
					tableName: 'new_yorkers';
					name: 'id';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
				}>;
				cityId: PgSerial<{
					tableName: 'new_yorkers';
					name: 'id';
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
			userId: PgSerial<{
				tableName: 'new_yorkers';
				name: 'id';
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
			}>;
			cityId: PgSerial<{
				tableName: 'new_yorkers';
				name: 'id';
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
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
				userId: PgSerial<{
					tableName: 'new_yorkers';
					name: 'id';
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
				}>;
				cityId: PgSerial<{
					tableName: 'new_yorkers';
					name: 'id';
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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
				userId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'user_id';
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
				}>;
				cityId: PgInteger<{
					tableName: 'new_yorkers';
					name: 'city_id';
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
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

	const t1 = customTextRequired('t', { length: 10 });
	// @ts-expect-error
	const t2 = customTextRequired('t');
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

	const t1 = customTextOptional('t', { length: 10 });
	const t2 = customTextOptional('t');
}

{
	const cities = pgTable('cities_table', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		population: integer('population').default(0),
	}, (cities) => ({
		citiesNameIdx: index().on(cities.id),
	}));

	Expect<
		Equal<
			PgTableWithColumns<{
				name: 'cities_table';
				schema: undefined;
				columns: {
					id: PgSerial<{
						tableName: 'cities_table';
						name: 'id';
						data: number;
						driverParam: number;
						hasDefault: true;
						notNull: true;
					}>;
					name: PgText<{
						tableName: 'cities_table';
						name: 'name';
						data: string;
						driverParam: string;
						hasDefault: false;
						enum: [string, ...string[]];
						notNull: true;
					}>;
					role: PgText<{
						tableName: 'cities_table';
						name: 'role';
						data: 'admin' | 'user';
						driverParam: string;
						hasDefault: true;
						enum: ['admin', 'user'];
						notNull: true;
					}>;
					population: PgInteger<{
						tableName: 'cities_table';
						name: 'population';
						data: number;
						driverParam: string | number;
						notNull: false;
						hasDefault: true;
					}>;
				};
			}>,
			typeof cities
		>
	>;
}

{
	const test = pgTable('test', {
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
	Expect<Equal<{ col1: string }, InferModel<typeof test>>>;
}

{
	const a = ['a', 'b', 'c'] as const;
	const b = pgEnum('test', a);
	const c = z.enum(b.enumValues);
}

{
	const b = pgEnum('test', ['a', 'b', 'c']);
	const c = z.enum(b.enumValues);
}

{
	function getUsersTable<TSchema extends string>(schemaName: TSchema) {
		return pgSchema(schemaName).table('users', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
		});
	}

	const users1 = getUsersTable('id1');
	Expect<Equal<'id1', typeof users1._.schema>>;

	const users2 = getUsersTable('id2');
	Expect<Equal<'id2', typeof users2._.schema>>;
}
