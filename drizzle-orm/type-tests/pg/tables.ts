import crypto from 'node:crypto';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { z } from 'zod';
import {
	bigint,
	bigserial,
	bit,
	boolean,
	char,
	check,
	cidr,
	customType,
	date,
	decimal,
	doublePrecision,
	foreignKey,
	geometry,
	halfvec,
	index,
	inet,
	integer,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	type PgColumn,
	pgEnum,
	pgTable,
	type PgTableWithColumns,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	sparsevec,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	vector,
} from '~/pg-core/index.ts';
import { pgSchema } from '~/pg-core/schema.ts';
import {
	pgMaterializedView,
	type PgMaterializedViewWithSelection,
	pgView,
	type PgViewWithSelection,
} from '~/pg-core/view.ts';
import { eq, gt } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { InferInsertModel, InferSelectModel } from '~/table.ts';
import type { Simplify } from '~/utils.ts';
import { db } from './db.ts';

export const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);

export const identityColumnsTable = pgTable('identity_columns_table', {
	generatedCol: integer('generated_col').generatedAlwaysAs(1),
	alwaysAsIdentity: integer('always_as_identity').generatedAlwaysAsIdentity(),
	byDefaultAsIdentity: integer('by_default_as_identity').generatedByDefaultAsIdentity(),
	name: text('name'),
});

Expect<Equal<InferSelectModel<typeof identityColumnsTable>, typeof identityColumnsTable['$inferSelect']>>;
Expect<Equal<InferSelectModel<typeof identityColumnsTable>, typeof identityColumnsTable['_']['inferSelect']>>;
Expect<Equal<InferInsertModel<typeof identityColumnsTable>, typeof identityColumnsTable['$inferInsert']>>;
Expect<Equal<InferInsertModel<typeof identityColumnsTable>, typeof identityColumnsTable['_']['inferInsert']>>;
Expect<
	Equal<
		InferInsertModel<typeof identityColumnsTable, { dbColumnNames: false; override: true }>,
		Simplify<typeof identityColumnsTable['$inferInsert'] & { alwaysAsIdentity?: number | undefined }>
	>
>;
Expect<
	Equal<
		InferInsertModel<typeof identityColumnsTable, { dbColumnNames: false; override: true }>,
		Simplify<typeof identityColumnsTable['_']['inferInsert'] & { alwaysAsIdentity?: number | undefined }>
	>
>;

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
	(users) => [
		uniqueIndex('usersAge1Idx').on(users.class.asc().nullsFirst(), sql``),
		index('usersAge2Idx').on(sql``),
		uniqueIndex('uniqueClass')
			.using('btree', users.class.desc().op('text_ops'), users.subClass.nullsLast())
			.where(sql`${users.class} is not null`)
			.concurrently(),
		check('legalAge', sql`${users.age1} > 18`),
		foreignKey({ columns: [users.subClass], foreignColumns: [classes.subClass] })
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		}),
		primaryKey(users.age1, users.class),
	],
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

export const smallSerialTest = pgTable('cities_table', {
	id: smallserial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
});

Expect<
	Equal<{
		id?: number;
		name: string;
		population?: number | null;
	}, typeof smallSerialTest.$inferInsert>
>;

export const classes = pgTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

Expect<
	Equal<{
		id?: number;
		class?: 'A' | 'C' | null;
		subClass: 'B' | 'D';
	}, typeof classes.$inferInsert>
>;

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
}, (cities) => [index().on(cities.id)]);

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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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

export const newYorkers2 = pgMaterializedView('new_yorkers')
	.using('btree')
	.with({
		fillfactor: 90,
		toastTupleTarget: 0.5,
		autovacuumEnabled: true,
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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
			toastTupleTarget: 0.5,
			autovacuumEnabled: true,
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
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: true;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
			toastTupleTarget: 0.5,
			autovacuumEnabled: true,
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
			toastTupleTarget: 0.5,
			autovacuumEnabled: true,
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
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
	customTextRequired({ length: 10 });
	// @ts-expect-error - config is required
	customTextRequired('t');
	// @ts-expect-error - config is required
	customTextRequired();
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
	customTextOptional({ length: 10 });
	customTextOptional();
}

{
	const cities1 = pgTable('cities_table', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		population: integer('population').default(0),
	});
	const cities2 = pgTable('cities_table', ({ serial, text, integer }) => ({
		id: serial('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		population: integer('population').default(0),
	}));

	type Expected = PgTableWithColumns<{
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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
				identity: undefined;
				isPrimaryKey: false;
				isAutoincrement: false;
				hasRuntimeDefault: false;
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
				identity: undefined;
				isPrimaryKey: false;
				isAutoincrement: false;
				hasRuntimeDefault: false;
			}>;
		};
	}>;

	Expect<Equal<Expected, typeof cities1>>;
	Expect<Equal<Expected, typeof cities2>>;
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
	const testSchema = pgSchema('test');

	const e1 = pgEnum('test', ['a', 'b', 'c']);
	const e2 = pgEnum('test', ['a', 'b', 'c'] as const);
	const e3 = testSchema.enum('test', ['a', 'b', 'c']);
	const e4 = testSchema.enum('test', ['a', 'b', 'c'] as const);

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
		col12: e3('col4'),
		col13: e4('col5'),
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
	Expect<Equal<['a', 'b', 'c'], typeof test.col12.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col13.enumValues>>;
}

{
	const testSchema = pgSchema('test');

	const e1 = pgEnum('test', ['a', 'b', 'c']);
	const e2 = pgEnum('test', ['a', 'b', 'c'] as const);
	const e3 = testSchema.enum('test', ['a', 'b', 'c']);
	const e4 = testSchema.enum('test', ['a', 'b', 'c'] as const);

	const test = pgTable('test', {
		col1: char('col1', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		col2: char('col2', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		col3: char('col3').generatedAlwaysAs(sql``),
		col4: e1('col4').generatedAlwaysAs(sql``),
		col5: e2('col5').generatedAlwaysAs(sql``),
		col6: text('col6', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		col7: text('col7', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		col8: text('col8').generatedAlwaysAs(sql``),
		col9: varchar('col9', { enum: ['a', 'b', 'c'] as const }).generatedAlwaysAs(sql``),
		col10: varchar('col10', { enum: ['a', 'b', 'c'] }).generatedAlwaysAs(sql``),
		col11: varchar('col11').generatedAlwaysAs(sql``),
		col12: e3('col4').generatedAlwaysAs(sql``),
		col13: e4('col5').generatedAlwaysAs(sql``),
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
	Expect<Equal<['a', 'b', 'c'], typeof test.col12.enumValues>>;
	Expect<Equal<['a', 'b', 'c'], typeof test.col13.enumValues>>;
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
	const enum_ = pgEnum('enum', ['a', 'b', 'c']);

	pgTable('all_columns', {
		enum: enum_('enum'),
		enumdef: enum_('enumdef').default('a'),
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
		timedef: time('timedef').default('00:00:00'),
		timedefnow: time('timedefnow').defaultNow(),
		timestamp: timestamp('timestamp'),
		timestamp2: timestamp('timestamp2', { precision: 6, withTimezone: true }),
		timestamp3: timestamp('timestamp3', { withTimezone: true }),
		timestamp4: timestamp('timestamp4', { precision: 4 }),
		timestampdef: timestamp('timestampdef').default(new Date()),
		date: date('date', { mode: 'date' }),
		datedef: date('datedef').default('2024-01-01'),
		datedefnow: date('datedefnow').defaultNow(),
	});

	pgTable('all_postgis_columns', {
		geometry: geometry('geometry'),
		geometry2: geometry('geometry2', { srid: 2, mode: 'xy' }),
		geometry3: geometry('geometry3', { srid: 3, mode: 'tuple' }),
		geometry4: geometry('geometry4', { mode: 'tuple' }),
		geometrydef: geometry('geometrydef').default([1, 2]),
		point: point('point'),
		point2: point('point2', { mode: 'xy' }),
		pointdef: point('pointdef').default([1, 2]),
		line: line('line'),
		line2: line('line2', { mode: 'abc' }),
		linedef: line('linedef').default([1, 2, 3]),
	});

	pgTable('all_vector_columns', {
		bit: bit('bit', { dimensions: 1 }),
		bitdef: bit('bitdef', { dimensions: 1 }).default('1'),
		halfvec: halfvec('halfvec', { dimensions: 1 }),
		halfvecdef: halfvec('halfvecdef', { dimensions: 1 }).default([1]),
		sparsevec: sparsevec('sparsevec', { dimensions: 1 }),
		sparsevecdef: sparsevec('sparsevecdef', { dimensions: 1 }).default('{1:1}/1'),
		vector: vector('vector', { dimensions: 1 }),
		vectordef: vector('vectordef', { dimensions: 1 }).default([1]),
	});
}

{
	const keysAsColumnNames = pgTable('test', {
		id: serial(),
		name: text(),
	});

	Expect<Equal<typeof keysAsColumnNames['id']['_']['name'], 'id'>>;
	Expect<Equal<typeof keysAsColumnNames['name']['_']['name'], 'name'>>;
}

{
	const enum_ = pgEnum('enum', ['a', 'b', 'c']);

	pgTable('all_columns_without_name', {
		enum: enum_(),
		enumdef: enum_().default('a'),
		sm: smallint(),
		smdef: smallint().default(10),
		int: integer(),
		intdef: integer().default(10),
		numeric: numeric(),
		numeric2: numeric({ precision: 5 }),
		numeric3: numeric({ scale: 2 }),
		numeric4: numeric({ precision: 5, scale: 2 }),
		numericdef: numeric().default('100'),
		bigint: bigint({ mode: 'number' }),
		bigintdef: bigint({ mode: 'number' }).default(100),
		bool: boolean(),
		booldef: boolean().default(true),
		text: text(),
		textdef: text().default('text'),
		varchar: varchar(),
		varchardef: varchar().default('text'),
		serial: serial(),
		bigserial: bigserial({ mode: 'number' }),
		decimal: decimal({ precision: 100, scale: 2 }),
		decimaldef: decimal({ precision: 100, scale: 2 }).default('100.0'),
		doublePrecision: doublePrecision(),
		doublePrecisiondef: doublePrecision().default(100),
		real: real(),
		realdef: real().default(100),
		json: json().$type<{ attr: string }>(),
		jsondef: json().$type<{ attr: string }>().default({ attr: 'value' }),
		jsonb: jsonb().$type<{ attr: string }>(),
		jsonbdef: jsonb().$type<{ attr: string }>().default({ attr: 'value' }),
		time: time(),
		time2: time({ precision: 6, withTimezone: true }),
		timedef: time().default('00:00:00'),
		timedefnow: time().defaultNow(),
		timestamp: timestamp(),
		timestamp2: timestamp({ precision: 6, withTimezone: true }),
		timestamp3: timestamp({ withTimezone: true }),
		timestamp4: timestamp({ precision: 4 }),
		timestampdef: timestamp().default(new Date()),
		date: date({ mode: 'date' }),
		datedef: date().default('2024-01-01'),
		datedefnow: date().defaultNow(),
	});

	pgTable('all_postgis_columns', {
		geometry: geometry(),
		geometry2: geometry({ srid: 2, mode: 'xy' }),
		geometry3: geometry({ srid: 3, mode: 'tuple' }),
		geometry4: geometry({ mode: 'tuple' }),
		geometrydef: geometry().default([1, 2]),
		point: point(),
		point2: point({ mode: 'xy' }),
		pointdef: point().default([1, 2]),
		line: line(),
		line2: line({ mode: 'abc' }),
		linedef: line().default([1, 2, 3]),
	});

	pgTable('all_vector_columns', {
		bit: bit({ dimensions: 1 }),
		bitdef: bit({ dimensions: 1 }).default('1'),
		halfvec: halfvec({ dimensions: 1 }),
		halfvecdef: halfvec({ dimensions: 1 }).default([1]),
		sparsevec: sparsevec({ dimensions: 1 }),
		sparsevecdef: sparsevec({ dimensions: 1 }).default('{1:1}/1'),
		vector: vector({ dimensions: 1 }),
		vectordef: vector({ dimensions: 1 }).default([1]),
	});
}

// ts enums test
{
	enum Role {
		admin = 'admin',
		user = 'user',
		guest = 'guest',
	}

	const role = pgEnum('role', Role);

	enum RoleNonString {
		admin,
		user,
		guest,
	}

	// @ts-expect-error
	pgEnum('role', RoleNonString);

	enum RolePartiallyString {
		admin,
		user = 'user',
		guest = 'guest',
	}

	// @ts-expect-error
	pgEnum('role', RolePartiallyString);

	const table = pgTable('table', {
		enum: role('enum'),
	});

	const res = await db.select().from(table);

	Expect<Equal<{ enum: Role | null }[], typeof res>>;

	const mySchema = pgSchema('my_schema');

	const schemaRole = mySchema.enum('role', Role);

	// @ts-expect-error
	mySchema.enum('role', RoleNonString);

	// @ts-expect-error
	mySchema.enum('role', RolePartiallyString);

	const schemaTable = mySchema.table('table', {
		enum: schemaRole('enum'),
	});

	const schemaRes = await db.select().from(schemaTable);

	Expect<Equal<{ enum: Role | null }[], typeof schemaRes>>;
}
