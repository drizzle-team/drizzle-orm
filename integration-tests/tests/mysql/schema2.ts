import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	blob,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	longblob,
	longtext,
	mediumblob,
	mediumint,
	mediumtext,
	type MySqlColumn,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	type MySqlTableWithColumns,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyblob,
	tinyint,
	tinytext,
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';

export const createUserTable = (name: string) => {
	return mysqlTable(name, {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});
};

export const createCitiesTable = (name: string) =>
	mysqlTable(name, {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

export const createUsers2Table = (
	name: string,
	citiesTable: MySqlTableWithColumns<{
		name: string;
		schema: undefined;
		dialect: 'mysql';
		columns: { id: MySqlColumn<any> };
	}>,
) =>
	mysqlTable(name, {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').references(() => citiesTable.id),
	});

export const createUsersOnUpdateTable = (name: string) =>
	mysqlTable(name, {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
		updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$onUpdate(() => new Date()),
		uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper(name)`),
		alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
	});

export const createCountTestTable = (name: string) =>
	mysqlTable(name, {
		id: int('id').notNull(),
		name: text('name').notNull(),
	});

export const datesTable = mysqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
	timestamp: timestamp('timestamp', { fsp: 3 }),
	timestampAsString: timestamp('timestamp_as_string', { fsp: 3, mode: 'string' }),
	year: year('year'),
});

export const coursesTable = mysqlTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

export const courseCategoriesTable = mysqlTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

export const createOrdersTable = (name: string) =>
	mysqlTable(name, {
		id: serial('id').primaryKey(),
		region: text('region').notNull(),
		product: text('product').notNull().$default(() => 'random_string'),
		amount: int('amount').notNull(),
		quantity: int('quantity').notNull(),
	});

export const usersMigratorTable = mysqlTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => [uniqueIndex('').on(table.name).using('btree')]);

// To test aggregate functions
export const createAggregateTable = (name: string) =>
	mysqlTable(name, {
		id: serial('id').notNull(),
		name: text('name').notNull(),
		a: int('a'),
		b: int('b'),
		c: int('c'),
		nullOnly: int('null_only'),
	});

// To test another schema and multischema
export const mySchema = mysqlSchema(`mySchema`);

export const usersMySchemaTable = mySchema.table('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

export const users2MySchemaTable = mySchema.table('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => citiesMySchemaTable.id),
});

export const citiesMySchemaTable = mySchema.table('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
