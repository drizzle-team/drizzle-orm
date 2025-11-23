import { DateDuration, Duration, LocalDate, LocalDateTime, RelativeDuration } from 'gel';
import crypto from 'node:crypto';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { relDuration } from '~/gel-core/columns/relative-duration.ts';
import {
	bigint,
	bigintT,
	boolean,
	check,
	dateDuration,
	decimal,
	doublePrecision,
	duration,
	foreignKey,
	type GelColumn,
	gelTable,
	type GelTableWithColumns,
	index,
	integer,
	json,
	localDate,
	primaryKey,
	real,
	smallint,
	text,
	timestamp,
	timestamptz,
	uniqueIndex,
	uuid,
} from '~/gel-core/index.ts';
import { gelSchema } from '~/gel-core/schema.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { InferInsertModel, InferSelectModel } from '~/table.ts';
import type { Simplify } from '~/utils.ts';
import { db } from './db.ts';

// export const myEnum = gelEnum('my_enum', ['a', 'b', 'c']);

export const identityColumnsTable = gelTable('identity_columns_table', {
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

export const users = gelTable(
	'users_table',
	{
		id: integer('id').primaryKey(),
		uuid: uuid('uuid').notNull(),
		homeCity: integer('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: integer('current_city').references(() => cities.id),
		class: text('class').notNull(),
		subClass: text('sub_class'),
		text: text('text'),
		age1: integer('age1').notNull(),
		createdAt: timestamptz('created_at').notNull(),
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
		primaryKey({ columns: [users.age1, users.class] }),
	],
);

Expect<Equal<InferSelectModel<typeof users>, typeof users['$inferSelect']>>;
Expect<Equal<InferSelectModel<typeof users>, typeof users['_']['inferSelect']>>;
Expect<Equal<InferInsertModel<typeof users>, typeof users['$inferInsert']>>;
Expect<Equal<InferInsertModel<typeof users>, typeof users['_']['inferInsert']>>;

export const cities = gelTable('cities_table', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
}, (cities) => ({
	citiesNameIdx: index().on(cities.id),
}));

export const classes = gelTable('classes_table', {
	id: integer('id').primaryKey(),
	class: text('class'),
	subClass: text('sub_class').notNull(),
});

Expect<
	Equal<{
		id: number;
		class?: string | null;
		subClass: string;
	}, typeof classes.$inferInsert>
>;

export const salEmp = gelTable('sal_emp', {
	name: text('name').notNull(),
	payByQuarter: integer('pay_by_quarter').array().notNull(),
	schedule: text('schedule').array().array().notNull(),
});

export const tictactoe = gelTable('tictactoe', {
	squares: integer('squares').array(3).array(3).notNull(),
});

export const customSchema = gelSchema('custom');

export const citiesCustom = customSchema.table('cities_table', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
}, (cities) => [index().on(cities.id)]);

// TODO not exists
// {
// 	const newYorkers = gelView('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	}).existing();

// 	Expect<
// 		Equal<
// 			GelViewWithSelection<'new_yorkers', true, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: string | number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam: string | number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers
// 		>
// 	>;
// }

// {
// 	const newYorkers = customSchema.view('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	}).existing();

// 	Expect<
// 		Equal<
// 			GelViewWithSelection<'new_yorkers', true, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam:  number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers
// 		>
// 	>;
// }

// export const newYorkers2 = gelMaterializedView('new_yorkers')
// 	.using('btree')
// 	.with({
// 		fillfactor: 90,
// 		toastTupleTarget: 0.5,
// 		autovacuumEnabled: true,
// 	})
// 	.tablespace('custom_tablespace')
// 	.withNoData()
// 	.as((qb) => {
// 		const sq = qb
// 			.$with('sq')
// 			.as(
// 				qb.select({ userId: users.id, cityId: cities.id })
// 					.from(users)
// 					.leftJoin(cities, eq(cities.id, users.homeCity))
// 					.where(sql`${users.age1} > 18`),
// 			);
// 		return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
// 	});

// Expect<
// 	Equal<
// 		GelMaterializedViewWithSelection<'new_yorkers', false, {
// 			userId: GelColumn<{
// 				tableName: 'new_yorkers';
// 				name: 'id';
// 				dataType: 'number';
// 				columnType: 'GelSerial';
// 				data: number;
// 				driverParam: number;
// 				notNull: true;
// 				hasDefault: true;
// 				enumValues: undefined;
// 				baseColumn: never;
// 				generated: undefined;
// 				identity: undefined;
// 				isPrimaryKey: true;
// 				isAutoincrement: false;
// 				hasRuntimeDefault: false;
// 			}>;
// 			cityId: GelColumn<{
// 				tableName: 'new_yorkers';
// 				name: 'id';
// 				dataType: 'number';
// 				columnType: 'GelSerial';
// 				data: number;
// 				driverParam: number;
// 				notNull: false;
// 				hasDefault: true;
// 				enumValues: undefined;
// 				baseColumn: never;
// 				generated: undefined;
// 				identity: undefined;
// 				isPrimaryKey: true;
// 				isAutoincrement: false;
// 				hasRuntimeDefault: false;
// 			}>;
// 		}>,
// 		typeof newYorkers2
// 	>
// >;

// {
// 	const newYorkers2 = customSchema.materializedView('new_yorkers')
// 		.using('btree')
// 		.with({
// 			fillfactor: 90,
// 			toastTupleTarget: 0.5,
// 			autovacuumEnabled: true,
// 		})
// 		.tablespace('custom_tablespace')
// 		.withNoData()
// 		.as((qb) => {
// 			const sq = qb
// 				.$with('sq')
// 				.as(
// 					qb.select({ userId: users.id, cityId: cities.id })
// 						.from(users)
// 						.leftJoin(cities, eq(cities.id, users.homeCity))
// 						.where(sql`${users.age1} > 18`),
// 				);
// 			return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
// 		});

// 	Expect<
// 		Equal<
// 			GelMaterializedViewWithSelection<'new_yorkers', false, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'id';
// 					dataType: 'number';
// 					columnType: 'GelSerial';
// 					data: number;
// 					driverParam: number;
// 					notNull: true;
// 					hasDefault: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: true;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'id';
// 					dataType: 'number';
// 					columnType: 'GelSerial';
// 					data: number;
// 					driverParam: number;
// 					notNull: false;
// 					hasDefault: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: true;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers2
// 		>
// 	>;
// }

// {
// 	const newYorkers2 = gelMaterializedView('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	})
// 		.using('btree')
// 		.with({
// 			fillfactor: 90,
// 			toastTupleTarget: 0.5,
// 			autovacuumEnabled: true,
// 		})
// 		.tablespace('custom_tablespace')
// 		.withNoData()
// 		.as(
// 			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
// 				eq(cities.id, users.homeCity)
// 			} where ${gt(users.age1, 18)}`,
// 		);

// 	Expect<
// 		Equal<
// 			GelMaterializedViewWithSelection<'new_yorkers', false, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: string | number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam: string | number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers2
// 		>
// 	>;
// }

// {
// 	const newYorkers2 = customSchema.materializedView('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	})
// 		.using('btree')
// 		.with({
// 			fillfactor: 90,
// 			toastTupleTarget: 0.5,
// 			autovacuumEnabled: true,
// 		})
// 		.tablespace('custom_tablespace')
// 		.withNoData()
// 		.as(
// 			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
// 				eq(cities.id, users.homeCity)
// 			} where ${gt(users.age1, 18)}`,
// 		);

// 	Expect<
// 		Equal<
// 			GelMaterializedViewWithSelection<'new_yorkers', false, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: string | number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam: string | number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers2
// 		>
// 	>;
// }

// {
// 	const newYorkers2 = gelMaterializedView('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	}).existing();

// 	Expect<
// 		Equal<
// 			GelMaterializedViewWithSelection<'new_yorkers', true, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: string | number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam: string | number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers2
// 		>
// 	>;
// }

// {
// 	const newYorkers2 = customSchema.materializedView('new_yorkers', {
// 		userId: integer('user_id').notNull(),
// 		cityId: integer('city_id'),
// 	}).existing();

// 	Expect<
// 		Equal<
// 			GelMaterializedViewWithSelection<'new_yorkers', true, {
// 				userId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'user_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					data: number;
// 					driverParam: string | number;
// 					hasDefault: false;
// 					notNull: true;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 				cityId: GelColumn<{
// 					tableName: 'new_yorkers';
// 					name: 'city_id';
// 					dataType: 'number';
// 					columnType: 'GelInteger';
// 					notNull: false;
// 					hasDefault: false;
// 					data: number;
// 					driverParam: string | number;
// 					enumValues: undefined;
// 					baseColumn: never;
// 					generated: undefined;
// 					identity: undefined;
// 					isPrimaryKey: false;
// 					isAutoincrement: false;
// 					hasRuntimeDefault: false;
// 				}>;
// 			}>,
// 			typeof newYorkers2
// 		>
// 	>;
// }

// await db.refreshMaterializedView(newYorkers2).concurrently();
// await db.refreshMaterializedView(newYorkers2).withNoData();
// await db.refreshMaterializedView(newYorkers2).concurrently().withNoData();
// await db.refreshMaterializedView(newYorkers2).withNoData().concurrently();

// await migrate(db, {
// 	migrationsFolder: './drizzle/gel',
// 	onMigrationError(error) {
// 		if (['0001_drizli_klaud', '0002_beep_boop'].includes(error.migration.name)) {
// 			return;
// 		}
// 		throw error;
// 	},
// });

// TODO not sure that this should be implemented now
// {
// 	const customTextRequired = customType<{
// 		data: string;
// 		driverData: string;
// 		config: { length: number };
// 		configRequired: true;
// 	}>({
// 		dataType(config) {
// 			Expect<Equal<{ length: number }, typeof config>>;
// 			return `varchar(${config.length})`;
// 		},

// 		toDriver(value) {
// 			Expect<Equal<string, typeof value>>();
// 			return value;
// 		},

// 		fromDriver(value) {
// 			Expect<Equal<string, typeof value>>();
// 			return value;
// 		},
// 	});

// 	customTextRequired('t', { length: 10 });
// 	customTextRequired({ length: 10 });
// 	// @ts-expect-error - config is required
// 	customTextRequired('t');
// 	// @ts-expect-error - config is required
// 	customTextRequired();
// }

// {
// 	const customTextOptional = customType<{
// 		data: string;
// 		driverData: string;
// 		config: { length: number };
// 	}>({
// 		dataType(config) {
// 			Expect<Equal<{ length: number } | undefined, typeof config>>;
// 			return config ? `varchar(${config.length})` : `text`;
// 		},

// 		toDriver(value) {
// 			Expect<Equal<string, typeof value>>();
// 			return value;
// 		},

// 		fromDriver(value) {
// 			Expect<Equal<string, typeof value>>();
// 			return value;
// 		},
// 	});

// 	customTextOptional('t', { length: 10 });
// 	customTextOptional('t');
// 	customTextOptional({ length: 10 });
// 	customTextOptional();
// }

{
	const cities1 = gelTable('cities_table', {
		id: integer('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role').$type<'admin' | 'user'>().default('user').notNull(),
		population: integer('population').default(0),
	});
	const cities2 = gelTable('cities_table', ({ text, integer }) => ({
		id: integer('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role').$type<'admin' | 'user'>().default('user').notNull(),
		population: integer('population').default(0),
	}));

	type Expected = GelTableWithColumns<{
		name: 'cities_table';
		schema: undefined;
		dialect: 'gel';
		columns: {
			id: GelColumn<{
				tableName: 'cities_table';
				name: 'id';
				dataType: 'number';
				columnType: 'GelInteger';
				data: number;
				driverParam: number;
				hasDefault: false;
				notNull: true;
				enumValues: undefined;
				baseColumn: never;
				generated: undefined;
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
			}>;
			name: GelColumn<{
				tableName: 'cities_table';
				name: 'name';
				dataType: 'string';
				columnType: 'GelText';
				data: string;
				driverParam: string;
				hasDefault: false;
				enumValues: undefined;
				notNull: true;
				baseColumn: never;
				generated: undefined;
				identity: undefined;
				isPrimaryKey: true;
				isAutoincrement: false;
				hasRuntimeDefault: false;
			}>;
			role: GelColumn<
				{
					tableName: 'cities_table';
					name: 'role';
					dataType: 'string';
					columnType: 'GelText';
					data: 'admin' | 'user';
					driverParam: string;
					hasDefault: true;
					enumValues: undefined;
					notNull: true;
					baseColumn: never;
					generated: undefined;
					identity: undefined;
					isPrimaryKey: false;
					isAutoincrement: false;
					hasRuntimeDefault: false;
				},
				{},
				{ $type: 'admin' | 'user' }
			>;
			population: GelColumn<{
				tableName: 'cities_table';
				name: 'population';
				dataType: 'number';
				columnType: 'GelInteger';
				data: number;
				driverParam: number;
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
	gelTable('test', {
		bigint: bigintT('bigintT').default(BigInt(10)),
		timestamp: timestamp('timestamp').default(new LocalDateTime(2023, 12, 3, 12, 3, 12)),
		timestamptz: timestamptz('timestamp2').default(new Date()),
	});
}

{
	const test = gelTable('test', {
		col1: decimal('col1').notNull().default('10.2'),
	});
	Expect<Equal<{ col1: string }, typeof test.$inferSelect>>;
}

{
	const getUsersTable = <TSchema extends string>(schemaName: TSchema) => {
		return gelSchema(schemaName).table('users', {
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
	const internalStaff = gelTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = gelTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = gelTable('ticket', {
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
	const test = gelTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	gelTable('test', {
		id: integer('id').$default(() => 1),
		id2: integer('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: integer('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: integer('id').$defaultFn(() => '1'),
	});
}

{
	gelTable('all_columns', {
		sm: smallint('smallint'),
		smdef: smallint('smallint_def').default(10),
		int: integer('integer'),
		intdef: integer('integer_def').default(10),
		bigint: bigint('bigint'),
		bigintT: bigintT('bigintT').default(BigInt(100)),
		bool: boolean('boolean'),
		booldef: boolean('boolean_def').default(true),
		text: text('text'),
		textdef: text('textdef').default('text'),
		decimal: decimal('decimal'),
		decimaldef: decimal('decimaldef').default('100.0'),
		doublePrecision: doublePrecision('doublePrecision'),
		doublePrecisiondef: doublePrecision('doublePrecisiondef').default(100),
		real: real('real'),
		realdef: real('realdef').default(100),
		json: json('json').$type<{ attr: string }>(),
		jsondef: json('jsondef').$type<{ attr: string }>().default({ attr: 'value' }),
		jsonb: json('json').$type<{ attr: string }>(),
		jsonbdef: json('json').$type<{ attr: string }>().default({ attr: 'value' }),
		localDate: localDate('localDate'),
		localDate2: localDate('local_date_def').default(new LocalDate(2023, 12, 1)),
		duration: duration('duration'),
		durationdef: duration('durationdef').default(new Duration(12, 523, 0, 9, 0, 0, 0, 0, 0, 0)),
		relDuration: relDuration('relDuration'),
		relDurationdef: relDuration('relDurationdef').default(new RelativeDuration(12, 523, 0, 9, 0, 0, 0, 0, 0)),
		dateDuration: dateDuration('dateDuration'),
		dateDurationdef: dateDuration('relDurationdef').default(new DateDuration(12, 12, 12, 6)),
		timestamp: timestamp('timestamp'),
		timestampdef: timestamp('timestamp_def').default(new LocalDateTime(2023, 1, 1, 1, 1, 14, 0, 0, 0)),
		timestamptz: timestamptz('timestamp3'),
		timestamptz2: timestamptz('timestampdef').default(new Date()),
	});
}

{
	const keysAsColumnNames = gelTable('test', {
		id: integer(),
		name: text(),
	});

	Expect<Equal<typeof keysAsColumnNames['id']['_']['name'], 'id'>>;
	Expect<Equal<typeof keysAsColumnNames['name']['_']['name'], 'name'>>;
}

{
	gelTable('all_columns_without_name', {
		sm: smallint(),
		smdef: smallint().default(10),
		int: integer(),
		intdef: integer().default(10),
		bigint: bigint(),
		bigintT: bigintT().default(BigInt(100)),
		bool: boolean(),
		booldef: boolean().default(true),
		text: text(),
		textdef: text().default('text'),
		decimal: decimal(),
		decimaldef: decimal().default('100.0'),
		doublePrecision: doublePrecision(),
		doublePrecisiondef: doublePrecision().default(100),
		real: real(),
		realdef: real().default(100),
		json: json().$type<{ attr: string }>(),
		jsondef: json().$type<{ attr: string }>().default({ attr: 'value' }),
		jsonb: json().$type<{ attr: string }>(),
		jsonbdef: json().$type<{ attr: string }>().default({ attr: 'value' }),
		localDate: localDate(),
		localDate2: localDate().default(new LocalDate(2023, 12, 1)),
		duration: duration(),
		durationdef: duration().default(new Duration(12, 523, 0, 9, 0, 0, 0, 0, 0, 0)),
		relDuration: relDuration(),
		relDurationdef: relDuration().default(new RelativeDuration(12, 523, 0, 9, 0, 0, 0, 0, 0)),
		dateDuration: dateDuration(),
		dateDurationdef: dateDuration().default(new DateDuration(12, 12, 12, 6)),
		timestamp: timestamp(),
		timestampdef: timestamp().default(new LocalDateTime(2023, 1, 1, 1, 1, 14, 0, 0, 0)),
		timestamptz: timestamptz(),
		timestamptz2: timestamptz().default(new Date()),
	});
}
