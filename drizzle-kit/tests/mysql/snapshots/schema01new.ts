import { eq, SQL, sql } from 'drizzle-orm';
import {
	AnyMySqlColumn,
	bigint,
	binary,
	boolean,
	char,
	check,
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
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	mysqlView,
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
} from 'drizzle-orm/mysql-core';

// TODO: extend massively cc: @OleksiiKH0240
export const allDataTypes = mysqlTable('all_data_types', {
	int: int('int').default(2147483647),
	intScientific: int('int_scientific').default(1e4),
	intExpression: int('int_expression').default(sql`(1 + 1)`),
	tinyint: tinyint('tinyint').default(127),
	smallint: smallint('smallint').default(32767),
	mediumint: mediumint('mediumint').default(8388607),
	bigintUnsigned: bigint('bigint_unsigned', { mode: 'bigint', unsigned: true }),
	bigint53: bigint('bigint_53', { mode: 'number' }).default(9007199254740991),
	bigint63: bigint('bigint_63', { mode: 'bigint' }).default(sql`9223372036854775807`),
	real: real('real').default(10.123),
	realPrecisionScale: real('real_precision_scale', { precision: 6, scale: 2 }).default(10.12),
	decimal: decimal('decimal').default('10.123'),
	decimalPrecision: decimal('decimal_precision', { precision: 6 }).default('10.123'),
	decimalPrecisionScale: decimal('decimal_precision_scale', { precision: 6, scale: 2 }).default('10.123'),
	decimalBigint: decimal('decimal_bigint', { precision: 19, mode: 'bigint' }).default(9223372036854775807n),
	double: double('double').default(10.123),
	doublePrecisionScale: double('double_precision_scale', { precision: 6, scale: 2 }).default(10.12),
	doubleUnsigned: double('double_unsigned', { unsigned: true }).default(10.123),
	float: float('float').default(10.123),
	floatPrecision: float('float_precision', { precision: 6 }).default(10.123),
	floatPrecisionScale: float('float_precision_scale', { precision: 6, scale: 2 }).default(10.12),
	floatUnsigned: float('floatUnsigned', { unsigned: true }).default(10.123),
	serial: serial('serial').primaryKey(),
	binary: binary('binary', { length: 10 }).default('binary'),
	binaryExpression: binary('binary_expression', { length: 10 }).default(sql`(lower('HELLO'))`),
	varbinary: varbinary('varbinary', { length: 10 }).default('binary'),
	varbinaryExpression: varbinary('varbinary_expression', { length: 10 }).default(sql`(lower('HELLO'))`),
	char: char('char', { length: 255 }).default(`text'"\`:[]{},text`),
	varchar: varchar('varchar', { length: 256 }).default(`text'"\`:[]{},text`),
	text: text('text').default(`text'"\`:[]{},text`),
	tinytext: tinytext('tinytext').default(sql`('text''"\`:[]{},text')`),
	mediumtext: mediumtext('mediumtext').default(sql`('text''"\`:[]{},text')`),
	longtext: longtext('longtext').default(sql`('text''"\`:[]{},text')`),
	boolean: boolean('boolean').default(true),
	booleanNull: boolean('boolean_null').default(sql`null`),
	date: date('date', { mode: 'date' }),
	datetime: datetime('datetime', { mode: 'date' }).default(new Date('2025-05-23T12:53:53.000Z')),
	datetimeFsp: datetime('datetime_fsp', { mode: 'date', fsp: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
	time: time('time').default('15:50:33'),
	timeFsp: time('time_fsp', { fsp: 3 }).default('15:50:33.123'),
	year: year('year').default(2025),
	timestamp: timestamp('timestamp', { mode: 'date' }).default(new Date('2025-05-23T12:53:53.000Z')),
	timestampNow: timestamp('timestamp_now', { mode: 'date' }).defaultNow(),
	timestampFsp: timestamp('timestamp_fsp', { mode: 'date', fsp: 3 }).default(new Date('2025-05-23T12:53:53.115Z')),
	jsonArray: json('json_array').default(sql`('[9223372036854775807, 9223372036854775806]')`),
	json: json('json').default({ key: `text[]{},text` }),
	mysqlEnum: mysqlEnum('popularity', ['unknown', 'known', 'popular']).default(
		`popular`,
	),
});

// constraints
// unique
export const uniqueTable = mysqlTable('unique_table', {
	column1: int().primaryKey(),
	column2: serial(),
	column3: int().unique(),
	column4: int().unique('column4_custom_unique_name'),
	column5: int(),
	column6: int(),
}, (table) => [
	unique().on(table.column5),
	unique('custom_unique').on(table.column5, table.column6),
]);

// primary
export const compositePrimaryKey = mysqlTable('composite_primary_key', {
	column1: int(),
	column2: varchar({ length: 10 }),
}, (table) => [
	primaryKey({ columns: [table.column1, table.column2] }),
]);

export const compositePrimaryKeyCustomName = mysqlTable('composite_primary_key_custom_name', {
	column1: int(),
	column2: varchar({ length: 10 }),
}, (table) => [
	primaryKey({ columns: [table.column1, table.column2] }),
]);

// references
export const referencingTable = mysqlTable('referencing_table', {
	column0: int(),
	column1: int().unique().references(() => uniqueTable.column1, { onDelete: 'cascade', onUpdate: 'cascade' }),
	column2: int(),
	column3: int(),
	column4: int(),
	column5: varchar({ length: 10 }),
	column6: int().references((): AnyMySqlColumn => referencingTable.column0),
}, (table) => [
	primaryKey({ columns: [table.column0] }),
	foreignKey({
		name: 'referencing_table_custom_fk1',
		columns: [table.column2, table.column3],
		foreignColumns: [uniqueTable.column5, uniqueTable.column6],
	}),
	foreignKey({
		name: 'referencing_table_custom_fk2',
		columns: [table.column4, table.column5],
		foreignColumns: [compositePrimaryKey.column1, compositePrimaryKey.column2],
	}),
]);

// generatedAlwaysAs, check, index, not null, auto increment
export const table1 = mysqlTable('table1', {
	column1: varchar({ length: 256 }).generatedAlwaysAs("'Default'"),
	column2: varchar({ length: 256 }).generatedAlwaysAs((): SQL => sql`(concat(${table1.column1}, 'hello'))`, {
		mode: 'stored',
	}),
	column3: varchar({ length: 256 }).generatedAlwaysAs((): SQL => sql`(concat(${table1.column1}, 'hello'))`, {
		mode: 'virtual',
	}),
	column4: int().notNull().autoincrement().primaryKey(),
	column5: int(),
	column6: varchar({ length: 256 }),
}, (table) => [
	check('age_check1', sql`${table.column5} > 0`),
	index('table1_column4_index').on(table.column4),
	uniqueIndex('table1_column4_unique_index').on(table.column4),
	index('table1_composite_index').on(table.column5, table.column6),
	uniqueIndex('table1_composite_unique_index').on(table.column5, table.column6),
]);

// view
export const table1View1 = mysqlView('table1_view1').as((qb) => qb.select().from(table1));
export const table1View2 = mysqlView('table1_view2', {
	column4: int().notNull().autoincrement(),
}).as(
	sql`select column4 from ${table1} where ${eq(table1.column4, 3)}`,
);

export const users = mysqlTable('users1', {
	id: int().unique(),
	id1: int(),
	id2: int(),
}, (t) => [
	primaryKey({ columns: [t.id1, t.id2] }),
]);

export const analytics = mysqlSchema('analytics');

export const analyticsEvents = analytics.table(
	'events',
	{
		id: serial('id').primaryKey(),
		userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
		type: varchar('type', { length: 64 }).notNull(),
		payload: json('payload').default({}),
		occurredAt: timestamp('occurred_at', { fsp: 3 }).notNull().defaultNow(),
	},
	(t) => [index('idx_analytics_events_user_time').on(t.userId, t.occurredAt)],
);
