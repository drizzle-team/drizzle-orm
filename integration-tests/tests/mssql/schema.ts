import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	bit,
	char,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	int,
	mssqlSchema,
	mssqlTable,
	nchar,
	ntext,
	numeric,
	nvarchar,
	real,
	smallint,
	text,
	time,
	tinyint,
	uniqueIndex,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';

export const usersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { mode: 'text' }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { length: 300, mode: 'json' }).$type<string[]>(),
	createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const nvarcharWithJsonTable = mssqlTable('nvarchar_with_json', {
	id: int('id').identity().primaryKey(),
	json: nvarchar({ mode: 'json', length: 'max' }),
});

export const users2Table = mssqlTable('users2', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	cityId: int('city_id').default(sql`null`).references(() => citiesTable.id),
});

export const citiesTable = mssqlTable('cities', {
	id: int().primaryKey(),
	name: varchar({ length: 30 }).notNull(),
});

export const usersOnUpdate = mssqlTable('users_on_update', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: datetime('updated_at', { mode: 'date' }).$onUpdate(() => new Date()),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper([name])`),
	alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
});

export const datesTable = mssqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { precision: 1 }),
	timeAsString: time('time_as_string', { mode: 'string', precision: 1 }),
	datetime: datetime('datetime'),
	datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
});

export const coursesTable = mssqlTable('courses', {
	id: int().identity().primaryKey(),
	name: text().notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

export const courseCategoriesTable = mssqlTable('course_categories', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
});

export const orders = mssqlTable('orders', {
	id: int('id').primaryKey(),
	region: varchar('region', { length: 50 }).notNull(),
	product: varchar('product', { length: 50 }).notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

export const usersMigratorTable = mssqlTable('users12', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => [
	uniqueIndex('').on(table.name),
]);

// To test aggregate functions
export const aggregateTable = mssqlTable('aggregate_table', {
	id: int('id').identity().notNull(),
	name: varchar('name', { length: 30 }).notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

export const mySchema = mssqlSchema('mySchema');

export const usersSchemaTable = mySchema.table('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { mode: 'json', length: 100 }).$type<string[]>(),
	createdAt: datetime2('created_at', { precision: 2 }).notNull().defaultGetDate(),
});

export const users2SchemaTable = mySchema.table('users2', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

export const citiesSchemaTable = mySchema.table('cities', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
});

export const tableWithEnums = mySchema.table('enums_test_case', {
	id: int('id').primaryKey(),
	enum1: varchar('enum1', { enum: ['a', 'b', 'c'] }).notNull(),
	enum2: varchar('enum2', { enum: ['a', 'b', 'c'] }).default('a'),
	enum3: varchar('enum3', { enum: ['a', 'b', 'c'] }).notNull().default('b'),
});

export const employees = mssqlTable('employees', {
	employeeId: int().identity({ increment: 1, seed: 1 }).primaryKey(),
	name: nvarchar({ length: 100 }),
	departmentId: int(),
});

export const departments = mssqlTable('departments', {
	departmentId: int().primaryKey().identity({ increment: 1, seed: 1 }),
	departmentName: nvarchar({ length: 100 }),
});

export const allPossibleColumns = mssqlTable('all_possible_columns', {
	bigintBigint: bigint({ mode: 'bigint' }),
	bigintString: bigint({ mode: 'string' }),
	bigintNumber: bigint({ mode: 'number' }),
	bigintBigintDefault: bigint({ mode: 'bigint' }).default(BigInt(123)),
	bigintStringDefault: bigint({ mode: 'string' }).default('123'),
	bigintNumberDefault: bigint({ mode: 'number' }).default(123),
	binary: binary(),
	binaryLength: binary({ length: 1 }),
	binaryDefault: binary().default(Buffer.from([0x01])),

	bit: bit(),
	bitDefault: bit().default(false),

	char: char(),
	charWithConfig: char({ enum: ['123', '342'], length: 3 }),
	charDefault: char().default('4'),

	nchar: nchar(),
	ncharWithEnum: nchar({ enum: ['hello, world'], length: 12 }),
	ncharLength: nchar({ length: 231 }),
	ncharDefault: nchar().default('h'),

	date: date(),
	dateModeDate: date({ mode: 'date' }),
	dateModeString: date({ mode: 'string' }),
	dateDefault: date().default(new Date('2025-04-17')),
	dateModeStringDefault: date({ mode: 'string' }).default('2025-04-17'),

	dateTime: datetime(),
	dateTimeModeDate: datetime({ mode: 'date' }),
	dateTimeModeString: datetime({ mode: 'string' }),
	dateTimeDefault: datetime().default(new Date('2025-04-17 13:54:28.227')),
	dateTimeModeStringDefault: datetime({ mode: 'string' }).default(new Date('2025-04-17 13:54:28.227').toISOString()),

	dateTime2: datetime2(),
	dateTime2ModeDate: datetime2({ mode: 'date' }),
	dateTime2ModeString: datetime2({ mode: 'string' }),
	dateTime2WithPrecision: datetime2({ precision: 5 }),
	dateTime2Default: datetime2().default(new Date('2025-04-17 13:55:07.530')),
	dateTime2ModeStringDefault: datetime2({ mode: 'string' }).default(
		'2025-04-17 13:55:07.5300000',
	),
	dateTime2ModeStringWithPrecisionDefault: datetime2({ mode: 'string', precision: 1 }).default(
		'2025-04-17 13:55:07.5300000',
	),

	datetimeOffset: datetimeoffset(),
	datetimeOffsetModeDate: datetimeoffset({ mode: 'date' }),
	datetimeOffsetModeString: datetimeoffset({ mode: 'string' }),
	datetimeOffsetDefault: datetimeoffset().default(new Date('2025-04-18 11:47:41.000+3:00')),
	datetimeOffsetModeStringDefault: datetimeoffset({ mode: 'string' }).default('2025-04-18 11:47:41.000+3:00'),
	datetimeOffsetModeStringWithPrecisionDefault: datetimeoffset({ mode: 'string', precision: 1 }).default(
		'2025-04-18 11:47:41.000+3:00',
	),

	decimal: decimal(),
	decimalWithPrecision: decimal({ precision: 3 }),
	decimalWithConfig: decimal({ precision: 10, scale: 8 }),
	decimalDefaultString: decimal().default('1.312'),
	decimalDefaultNumber: decimal({ mode: 'number' }).default(1.3),

	float: float(),
	floatWithPrecision: float({ precision: 3 }),
	floatDefault: float().default(32.412),

	int: int(),
	intDefault: int().default(43),

	numeric: numeric(),
	numericWithPrecision: numeric({ precision: 3 }),
	numericWithConfig: numeric({ precision: 10, scale: 8 }),
	numericDefault: numeric().default('1.312'),
	numericDefaultNumber: numeric({ mode: 'number' }).default(1.312),

	real: real(),
	realDefault: real().default(5231.4123),

	text: text(),
	textEnum: text({ enum: ['only', 'this', 'values'] }),
	textDefault: text().default('hello, world'),

	nText: ntext(),
	nTextEnum: ntext({ enum: ['only', 'this', 'values'] }),
	nTextDefault: ntext().default('hello, world'),

	time: time(),
	timeModeDate: time({ mode: 'date' }),
	timeModeString: time({ mode: 'string' }),
	timeWithPrecision: time({ precision: 3 }),
	timeDefault: time().default(new Date('2025-10-10 14:17:56.470')),
	timeModeDateDefault: time({ mode: 'date' }).default(new Date('2025-10-10 14:17:56.470')),
	timeModeStringDefault: time({ mode: 'string' }).default('14:17:56.470'),

	smallint: smallint(),
	smallintDefault: smallint().default(331),

	tinyint: tinyint(),
	tinyintDefault: tinyint().default(23),

	varbinary: varbinary(),
	varbinaryWithLength: varbinary({ length: 100 }),
	varbinaryDefault: varbinary().default(Buffer.from([0x01])),

	varchar: varchar(),
	varcharWithEnum: varchar({ enum: ['123', '312'], length: 3 }),
	varcharWithLength: varchar({ length: 3 }),
	varcharDefault: varchar().default('hello, world'),
	varcharWithEnumDefault: varchar({ enum: ['1', '2'] }).default('1'),

	nvarchar: nvarchar(),
	nvarcharWithEnum: nvarchar({ enum: ['hello, world'], length: 12 }),
	nvarcharLength: nvarchar({ length: 231 }),
	nvarcharDefault: nvarchar().default('h'),
	nvarcharJson: nvarchar({ mode: 'json', length: 'max' }),
});
