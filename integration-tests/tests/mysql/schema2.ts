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
	mediumblob,
	mediumint,
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
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';

export const allTypesTable = mysqlTable('all_types', {
	serial: serial('serial'),
	bigint53: bigint('bigint53', {
		mode: 'number',
	}),
	bigint64: bigint('bigint64', {
		mode: 'bigint',
	}),
	bigintString: bigint('bigint_string', {
		mode: 'string',
	}),
	binary: binary('binary'),
	boolean: boolean('boolean'),
	char: char('char'),
	date: date('date', {
		mode: 'date',
	}),
	dateStr: date('date_str', {
		mode: 'string',
	}),
	datetime: datetime('datetime', {
		mode: 'date',
	}),
	datetimeStr: datetime('datetime_str', {
		mode: 'string',
	}),
	decimal: decimal('decimal'),
	decimalNum: decimal('decimal_num', {
		precision: 30,
		mode: 'number',
	}),
	decimalBig: decimal('decimal_big', {
		precision: 30,
		mode: 'bigint',
	}),
	double: double('double'),
	float: float('float'),
	int: int('int'),
	json: json('json'),
	medInt: mediumint('med_int'),
	smallInt: smallint('small_int'),
	real: real('real'),
	text: text('text'),
	time: time('time'),
	timestamp: timestamp('timestamp', {
		mode: 'date',
	}),
	timestampStr: timestamp('timestamp_str', {
		mode: 'string',
	}),
	tinyInt: tinyint('tiny_int'),
	varbin: varbinary('varbin', {
		length: 16,
	}),
	varchar: varchar('varchar', {
		length: 255,
	}),
	year: year('year'),
	enum: mysqlEnum('enum', ['enV1', 'enV2']),
	blob: blob('blob'),
	tinyblob: tinyblob('tinyblob'),
	mediumblob: mediumblob('mediumblob'),
	longblob: longblob('longblob'),
	stringblob: blob('stringblob', { mode: 'string' }),
	stringtinyblob: tinyblob('stringtinyblob', { mode: 'string' }),
	stringmediumblob: mediumblob('stringmediumblob', { mode: 'string' }),
	stringlongblob: longblob('stringlongblob', { mode: 'string' }),
});

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
