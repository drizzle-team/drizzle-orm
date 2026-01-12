import crypto from 'node:crypto';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { z } from 'zod';
import {
	bigint,
	bit,
	bool,
	char,
	check,
	cockroachEnum,
	cockroachTable,
	customType,
	date,
	decimal,
	doublePrecision,
	foreignKey,
	geometry,
	index,
	inet,
	int2,
	int4,
	int8,
	jsonb,
	numeric,
	primaryKey,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
	vector,
} from '~/cockroach-core/index.ts';
import { cockroachSchema } from '~/cockroach-core/schema.ts';
import { cockroachMaterializedView, cockroachView } from '~/cockroach-core/view.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { InferInsertModel, InferSelectModel } from '~/table.ts';
import type { Simplify } from '~/utils.ts';
import { db } from './db.ts';

export const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);

export const identityColumnsTable = cockroachTable('identity_columns_table', {
	generatedCol: int4('generated_col').generatedAlwaysAs(1),
	alwaysAsIdentity: int4('always_as_identity').generatedAlwaysAsIdentity(),
	byDefaultAsIdentity: int4('by_default_as_identity').generatedByDefaultAsIdentity(),
	name: text('name'),
});

Expect<Equal<InferSelectModel<typeof identityColumnsTable>, typeof identityColumnsTable['$inferSelect']>>;
Expect<Equal<InferInsertModel<typeof identityColumnsTable>, typeof identityColumnsTable['$inferInsert']>>;
Expect<
	Equal<
		InferInsertModel<typeof identityColumnsTable, { dbColumnNames: false; override: true }>,
		Simplify<typeof identityColumnsTable['$inferInsert'] & { alwaysAsIdentity?: number | undefined }>
	>
>;

export const users = cockroachTable(
	'users_table',
	{
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		uuid: uuid('uuid').defaultRandom().notNull(),
		homeCity: int4('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: int4('current_city').references(() => cities.id),
		int4Nullable: int4('int41'),
		int4NotNull: int4('int42').generatedAlwaysAsIdentity(),
		class: text('class', { enum: ['A', 'C'] }).notNull(),
		subClass: text('sub_class', { enum: ['B', 'D'] }),
		text: text('text'),
		age1: int4('age1').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		enumCol: myEnum('enum_col').notNull(),
		arrayCol: text('array_col').array().notNull(),
	},
	(users) => [
		uniqueIndex('usersAge1Idx').on(users.class.asc(), sql``),
		index('usersAge2Idx').on(sql``),
		uniqueIndex('uniqueClass')
			.using('btree', users.class.desc(), users.subClass)
			.where(sql`${users.class} is not null`),
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
Expect<Equal<InferInsertModel<typeof users>, typeof users['$inferInsert']>>;

export const cities = cockroachTable('cities_table', {
	id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	population: int4('population').default(0),
}, (cities) => [index().on(cities.id)]);

export const smallintTest = cockroachTable('cities_table', {
	id: smallint('id').primaryKey(),
	name: text('name').notNull(),
	population: int4('population').default(0),
});

Expect<
	Equal<{
		id: number;
		name: string;
		population?: number | null;
	}, typeof smallintTest.$inferInsert>
>;

export const classes = cockroachTable('classes_table', {
	id: int4('id').primaryKey(),
	class: text('class', { enum: ['A', 'C'] }),
	subClass: text('sub_class', { enum: ['B', 'D'] }).notNull(),
});

Expect<
	Equal<{
		id: number;
		class?: 'A' | 'C' | null;
		subClass: 'B' | 'D';
	}, typeof classes.$inferInsert>
>;

export const network = cockroachTable('network_table', {
	inet: inet('inet').notNull(),
});

Expect<
	Equal<{
		inet: string;
	}, typeof network.$inferSelect>
>;

export const salEmp = cockroachTable('sal_emp', {
	name: text('name').notNull(),
	payByQuarter: int4('pay_by_quarter').array().notNull(),
	schedule: text('schedule').array().notNull(),
});

export const customSchema = cockroachSchema('custom');

export const citiesCustom = customSchema.table('cities_table', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
	population: int4('population').default(0),
}, (cities) => [index().on(cities.id)]);

export const newYorkers = cockroachView('new_yorkers')
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

export const newYorkers2 = cockroachMaterializedView('new_yorkers')
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

await db.refreshMaterializedView(newYorkers2).concurrently();
await db.refreshMaterializedView(newYorkers2).withNoData();
await db.refreshMaterializedView(newYorkers2).concurrently().withNoData();
await db.refreshMaterializedView(newYorkers2).withNoData().concurrently();

// await migrate(db, {
// 	migrationsFolder: './drizzle/cockroach',
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
	cockroachTable('cities_table', {
		id: int4('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		role1: string('role1', { enum: ['admin', 'user'], length: 200 }).default('user').notNull(),
		population: int4('population').default(0),
	});
	cockroachTable('cities_table', ({ int4, text }) => ({
		id: int4('id').primaryKey(),
		name: text('name').notNull().primaryKey(),
		role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
		role1: string('role1', { enum: ['admin', 'user'], length: 200 }).default('user').notNull(),
		population: int4('population').default(0),
	}));
}

{
	cockroachTable('test', {
		bigint: bigint('bigint', { mode: 'bigint' }).default(BigInt(10)),
		bigintNumber: bigint('bigintNumber', { mode: 'number' }),
		timestamp: timestamp('timestamp').default(new Date()),
		timestamp2: timestamp('timestamp2', { mode: 'date' }).default(new Date()),
		timestamp3: timestamp('timestamp3', { mode: undefined }).default(new Date()),
		timestamp4: timestamp('timestamp4', { mode: 'string' }).default('2020-01-01'),
	});
}

{
	const test = cockroachTable('test', {
		col1: decimal('col1', { precision: 10, scale: 2 }).notNull().default('10.2'),
	});
	Expect<Equal<{ col1: string }, typeof test.$inferSelect>>;
}

{
	const a = ['a', 'b', 'c'] as const;
	const b = cockroachEnum('test', a);
	z.enum(b.enumValues);
}

{
	const b = cockroachEnum('test', ['a', 'b', 'c']);
	z.enum(b.enumValues);
}

{
	const getUsersTable = <TSchema extends string>(schemaName: TSchema) => {
		return cockroachSchema(schemaName).table('users', {
			id: int4('id').primaryKey(),
			name: text('name').notNull(),
		});
	};

	const users1 = getUsersTable('id1');
	Expect<Equal<'id1', typeof users1._.schema>>;

	const users2 = getUsersTable('id2');
	Expect<Equal<'id2', typeof users2._.schema>>;
}

{
	const internalStaff = cockroachTable('internal_staff', {
		userId: int4('user_id').notNull(),
	});

	const customUser = cockroachTable('custom_user', {
		id: int4('id').notNull(),
	});

	const ticket = cockroachTable('ticket', {
		staffId: int4('staff_id').notNull(),
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
	const newYorkers = cockroachView('new_yorkers')
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
	const testSchema = cockroachSchema('test');

	const e1 = cockroachEnum('test', ['a', 'b', 'c']);
	const e2 = cockroachEnum('test', ['a', 'b', 'c'] as const);
	const e3 = testSchema.enum('test', ['a', 'b', 'c']);
	const e4 = testSchema.enum('test', ['a', 'b', 'c'] as const);

	const test = cockroachTable('test', {
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
	const testSchema = cockroachSchema('test');

	const e1 = cockroachEnum('test', ['a', 'b', 'c']);
	const e2 = cockroachEnum('test', ['a', 'b', 'c'] as const);
	const e3 = testSchema.enum('test', ['a', 'b', 'c']);
	const e4 = testSchema.enum('test', ['a', 'b', 'c'] as const);

	const test = cockroachTable('test', {
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
	const test = cockroachTable('test', {
		id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
	});

	Expect<
		Equal<{
			id?: string;
		}, typeof test.$inferInsert>
	>;
}

{
	cockroachTable('test', {
		id: int4('id').$default(() => 1),
		id2: int4('id').$defaultFn(() => 1),
		// @ts-expect-error - should be number
		id3: int4('id').$default(() => '1'),
		// @ts-expect-error - should be number
		id4: int4('id').$defaultFn(() => '1'),
	});
}

{
	const enum_ = cockroachEnum('enum', ['a', 'b', 'c']);

	cockroachTable('all_columns', {
		enum: enum_('enum'),
		enumdef: enum_('enumdef').default('a'),
		sm: smallint('smallint'), // same as int2
		smdef: smallint('smallint_def').default(10), // same as int2
		int2col: int2('int2col'),
		int2colDef: int2('int2col_dev').default(10),
		int: int4('int4'),
		intdef: int4('int4_def').default(10),
		numeric: numeric('numeric'),
		numeric2: numeric('numeric2', { precision: 5 }),
		numeric3: numeric('numeric3', { scale: 2 }),
		numeric4: numeric('numeric4', { precision: 5, scale: 2 }),
		numericdef: numeric('numeridef').default('100'),
		bigint: bigint('bigint', { mode: 'number' }),
		bigintdef: bigint('bigintdef', { mode: 'number' }).default(100),
		bool: bool('boolean'),
		booldef: bool('boolean_def').default(true),
		text: text('text'),
		textdef: text('textdef').default('text'),
		varchar: varchar('varchar'),
		varchardef: varchar('varchardef').default('text'),
		int4: int4('int4'),
		decimal: decimal('decimal', { precision: 100, scale: 2 }),
		decimaldef: decimal('decimaldef', { precision: 100, scale: 2 }).default('100.0'),
		doublePrecision: doublePrecision('doublePrecision'),
		doublePrecisiondef: doublePrecision('doublePrecisiondef').default(100),
		real: real('real'),
		realdef: real('realdef').default(100),
		jsonb: jsonb('jsonb').$type<{ attr: string }>(),
		jsonbdef: jsonb('jsonbdef').$type<{ attr: string }>().default({ attr: 'value' }),
		time: time('time'),
		time2: time('time2', { precision: 6, withTimezone: true }),
		timedef: time('timedef').default('00:00:00'),
		timestamp: timestamp('timestamp'),
		timestamp2: timestamp('timestamp2', { precision: 6, withTimezone: true }),
		timestamp3: timestamp('timestamp3', { withTimezone: true }),
		timestamp4: timestamp('timestamp4', { precision: 4 }),
		timestampdef: timestamp('timestampdef').default(new Date()),
		date: date('date', { mode: 'date' }),
		datedef: date('datedef').default('2024-01-01'),
		datedefnow: date('datedefnow').defaultNow(),
	});

	cockroachTable('all_postgis_columns', {
		geometry: geometry('geometry'),
		geometry2: geometry('geometry2', { srid: 2, mode: 'xy' }),
		geometry3: geometry('geometry3', { srid: 3, mode: 'tuple' }),
		geometry4: geometry('geometry4', { mode: 'tuple' }),
		geometrydef: geometry('geometrydef').default([1, 2]),
	});

	cockroachTable('all_vector_columns', {
		bit: bit('bit', { length: 1 }),
		bitdef: bit('bitdef', { length: 1 }).default('1'),
		vector: vector('vector', { dimensions: 1 }),
		vectordef: vector('vectordef', { dimensions: 1 }).default([1]),
	});
}

{
	const keysAsColumnNames = cockroachTable('test', {
		id: int4(),
		name: text(),
	});

	Expect<Equal<typeof keysAsColumnNames['id']['_']['name'], string>>;
	Expect<Equal<typeof keysAsColumnNames['name']['_']['name'], string>>;
}

{
	const enum_ = cockroachEnum('enum', ['a', 'b', 'c']);

	cockroachTable('all_columns_without_name', {
		enum: enum_(),
		enumdef: enum_().default('a'),
		sm: smallint(),
		smdef: smallint().default(10),
		int: int4(),
		intdef: int4().default(10),
		numeric: numeric(),
		numeric2: numeric({ precision: 5 }),
		numeric3: numeric({ scale: 2 }),
		numeric4: numeric({ precision: 5, scale: 2 }),
		numericdef: numeric().default('100'),
		bigint: bigint({ mode: 'number' }),
		bigintdef: bigint({ mode: 'number' }).default(100),
		int8column: int8({ mode: 'number' }),
		int8columndef: int8({ mode: 'number' }).default(100),
		bool: bool(),
		booldef: bool().default(true),
		text: text(),
		textdef: text().default('text'),
		varchar: varchar(),
		varchardef: varchar().default('text'),
		int4: int4(),
		decimal: decimal({ precision: 100, scale: 2 }),
		decimaldef: decimal({ precision: 100, scale: 2 }).default('100.0'),
		doublePrecision: doublePrecision(),
		doublePrecisiondef: doublePrecision().default(100),
		real: real(),
		realdef: real().default(100),
		jsonb: jsonb().$type<{ attr: string }>(),
		jsonbdef: jsonb().$type<{ attr: string }>().default({ attr: 'value' }),
		time: time(),
		time2: time({ precision: 6, withTimezone: true }),
		timedef: time().default('00:00:00'),
		timedefnow: time(),
		timestamp: timestamp(),
		timestamp2: timestamp({ precision: 6, withTimezone: true }),
		timestamp3: timestamp({ withTimezone: true }),
		timestamp4: timestamp({ precision: 4 }),
		timestampdef: timestamp().default(new Date()),
		date: date({ mode: 'date' }),
		datedef: date().default('2024-01-01'),
		datedefnow: date().defaultNow(),
	});

	cockroachTable('all_postgis_columns', {
		geometry: geometry(),
		geometry2: geometry({ srid: 2, mode: 'xy' }),
		geometry3: geometry({ srid: 3, mode: 'tuple' }),
		geometry4: geometry({ mode: 'tuple' }),
		geometrydef: geometry().default([1, 2]),
	});

	cockroachTable('all_vector_columns', {
		bit: bit({ length: 1 }),
		bitdef: bit({ length: 1 }).default('1'),
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

	const role = cockroachEnum('role', Role);

	enum RoleNonString {
		admin,
		user,
		guest,
	}

	// @ts-expect-error
	cockroachEnum('role', RoleNonString);

	enum RolePartiallyString {
		admin,
		user = 'user',
		guest = 'guest',
	}

	// @ts-expect-error
	cockroachEnum('role', RolePartiallyString);

	const table = cockroachTable('table', {
		enum: role('enum'),
	});

	const res = await db.select().from(table);

	Expect<Equal<{ enum: Role | null }[], typeof res>>;

	const mySchema = cockroachSchema('my_schema');

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
