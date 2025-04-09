import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
	bigint,
	bigserial,
	boolean,
	char,
	date,
	decimal,
	doublePrecision,
	integer,
	interval,
	json,
	jsonb,
	line,
	numeric,
	pgEnum,
	pgSchema,
	point,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

export const schema = pgSchema('seeder_lib_pg');

export const customers = schema.table('customer', {
	id: varchar('id', { length: 256 }).primaryKey(),
	companyName: text('company_name').notNull(),
	contactName: text('contact_name').notNull(),
	contactTitle: text('contact_title').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	postalCode: text('postal_code'),
	region: text('region'),
	country: text('country').notNull(),
	phone: text('phone').notNull(),
	fax: text('fax'),
});

export const employees = schema.table(
	'employee',
	{
		id: integer('id').primaryKey(),
		lastName: text('last_name').notNull(),
		firstName: text('first_name'),
		title: text('title').notNull(),
		titleOfCourtesy: text('title_of_courtesy').notNull(),
		birthDate: timestamp('birth_date').notNull(),
		hireDate: timestamp('hire_date').notNull(),
		address: text('address').notNull(),
		city: text('city').notNull(),
		postalCode: text('postal_code').notNull(),
		country: text('country').notNull(),
		homePhone: text('home_phone').notNull(),
		extension: integer('extension').notNull(),
		notes: text('notes').notNull(),
		reportsTo: integer('reports_to').references((): AnyPgColumn => employees.id),
		photoPath: text('photo_path'),
	},
);

export const orders = schema.table('order', {
	id: integer('id').primaryKey(),
	orderDate: timestamp('order_date').notNull(),
	requiredDate: timestamp('required_date').notNull(),
	shippedDate: timestamp('shipped_date'),
	shipVia: integer('ship_via').notNull(),
	freight: numeric('freight').notNull(),
	shipName: text('ship_name').notNull(),
	shipCity: text('ship_city').notNull(),
	shipRegion: text('ship_region'),
	shipPostalCode: text('ship_postal_code'),
	shipCountry: text('ship_country').notNull(),

	customerId: text('customer_id')
		.notNull()
		.references(() => customers.id, { onDelete: 'cascade' }),

	employeeId: integer('employee_id')
		.notNull()
		.references(() => employees.id, { onDelete: 'cascade' }),
});

export const suppliers = schema.table('supplier', {
	id: integer('id').primaryKey(),
	companyName: text('company_name').notNull(),
	contactName: text('contact_name').notNull(),
	contactTitle: text('contact_title').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	region: text('region'),
	postalCode: text('postal_code').notNull(),
	country: text('country').notNull(),
	phone: text('phone').notNull(),
});

export const products = schema.table('product', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: numeric('unit_price').notNull(),
	unitsInStock: integer('units_in_stock').notNull(),
	unitsOnOrder: integer('units_on_order').notNull(),
	reorderLevel: integer('reorder_level').notNull(),
	discontinued: integer('discontinued').notNull(),

	supplierId: integer('supplier_id')
		.notNull()
		.references(() => suppliers.id, { onDelete: 'cascade' }),
});

export const details = schema.table('order_detail', {
	unitPrice: numeric('unit_price').notNull(),
	quantity: integer('quantity').notNull(),
	discount: numeric('discount').notNull(),

	orderId: integer('order_id')
		.notNull()
		.references(() => orders.id, { onDelete: 'cascade' }),

	productId: integer('product_id')
		.notNull()
		.references(() => products.id, { onDelete: 'cascade' }),
});

// All data types table -------------------------------
export const moodEnum = pgEnum('mood_enum', ['sad', 'ok', 'happy']);

export const allDataTypes = schema.table('all_data_types', {
	integer: integer('integer'),
	smallint: smallint('smallint'),
	biginteger: bigint('bigint', { mode: 'bigint' }),
	bigintNumber: bigint('bigint_number', { mode: 'number' }),
	serial: serial('serial'),
	smallserial: smallserial('smallserial'),
	bigserial: bigserial('bigserial', { mode: 'bigint' }),
	bigserialNumber: bigserial('bigserial_number', { mode: 'number' }),
	boolean: boolean('boolean'),
	text: text('text'),
	varchar: varchar('varchar', { length: 256 }),
	char: char('char', { length: 256 }),
	numeric: numeric('numeric'),
	decimal: decimal('decimal'),
	real: real('real'),
	doublePrecision: doublePrecision('double_precision'),
	json: json('json'),
	jsonb: jsonb('jsonb'),
	time: time('time'),
	timestampDate: timestamp('timestamp_date', { mode: 'date' }),
	timestampString: timestamp('timestamp_string', { mode: 'string' }),
	dateString: date('date_string', { mode: 'string' }),
	date: date('date', { mode: 'date' }),
	interval: interval('interval'),
	point: point('point', { mode: 'xy' }),
	pointTuple: point('point_tuple', { mode: 'tuple' }),
	line: line('line', { mode: 'abc' }),
	lineTuple: line('line_tuple', { mode: 'tuple' }),
	moodEnum: moodEnum('mood_enum'),
	uuid: uuid('uuid'),
});

export const allArrayDataTypes = schema.table('all_array_data_types', {
	integerArray: integer('integer_array').array(),
	smallintArray: smallint('smallint_array').array(),
	bigintegerArray: bigint('bigint_array', { mode: 'bigint' }).array(),
	bigintNumberArray: bigint('bigint_number_array', { mode: 'number' }).array(),
	booleanArray: boolean('boolean_array').array(),
	textArray: text('text_array').array(),
	varcharArray: varchar('varchar_array', { length: 256 }).array(),
	charArray: char('char_array', { length: 256 }).array(),
	numericArray: numeric('numeric_array').array(),
	decimalArray: decimal('decimal_array').array(),
	realArray: real('real_array').array(),
	doublePrecisionArray: doublePrecision('double_precision_array').array(),
	jsonArray: json('json_array').array(),
	jsonbArray: jsonb('jsonb_array').array(),
	timeArray: time('time_array').array(),
	timestampDateArray: timestamp('timestamp_date_array', { mode: 'date' }).array(),
	timestampStringArray: timestamp('timestamp_string_array', { mode: 'string' }).array(),
	dateStringArray: date('date_string_array', { mode: 'string' }).array(),
	dateArray: date('date_array', { mode: 'date' }).array(),
	intervalArray: interval('interval_array').array(),
	pointArray: point('point_array', { mode: 'xy' }).array(),
	pointTupleArray: point('point_tuple_array', { mode: 'tuple' }).array(),
	lineArray: line('line_array', { mode: 'abc' }).array(),
	lineTupleArray: line('line_tuple_array', { mode: 'tuple' }).array(),
	moodEnumArray: moodEnum('mood_enum_array').array(),
});

export const ndArrays = schema.table('nd_arrays', {
	integer1DArray: integer('integer_1d_array').array(3),
	integer2DArray: integer('integer_2d_array').array(3).array(4),
	integer3DArray: integer('integer_3d_array').array(3).array(4).array(5),
	integer4DArray: integer('integer_4d_array').array(3).array(4).array(5).array(6),
});

// All generators tables -------------------------------
export const enumTable = schema.table('enum_table', {
	mood: moodEnum('mood_enum'),
});

export const defaultTable = schema.table('default_table', {
	defaultString: text('default_string'),
});

export const defaultArrayTable = schema.table('default_array_table', {
	defaultString: text('default_string').array(),
});

export const valuesFromArrayTable = schema.table('values_from_array_table', {
	valuesFromArrayNotNull: varchar('values_from_array_not_null', { length: 256 }).notNull(),
	valuesFromArrayWeightedNotNull: varchar('values_from_array_weighted_not_null', { length: 256 }).notNull(),
});

export const valuesFromArrayUniqueTable = schema.table('values_from_array_unique_table', {
	valuesFromArray: varchar('values_from_array', { length: 256 }).unique(),
	valuesFromArrayNotNull: varchar('values_from_array_not_null', { length: 256 }).unique().notNull(),
	valuesFromArrayWeighted: varchar('values_from_array_weighted', { length: 256 }).unique(),
	valuesFromArrayWeightedNotNull: varchar('values_from_array_weighted_not_null', { length: 256 }).unique().notNull(),
});

export const valuesFromArrayArrayTable = schema.table('values_from_array_array_table', {
	valuesFromArray: varchar('values_from_array', { length: 256 }).array(),
});

export const intPrimaryKeyTable = schema.table('int_primary_key_table', {
	intPrimaryKey: integer('int_primary_key').unique(),
});

export const numberTable = schema.table('number_table', {
	number: real('number'),
});

export const numberUniqueTable = schema.table('number_unique_table', {
	numberUnique: real('number_unique').unique(),
});

export const numberArrayTable = schema.table('number_array_table', {
	number: real('number').array(),
});

export const intTable = schema.table('int_table', {
	int: integer('int'),
});

export const intUniqueTable = schema.table('int_unique_table', {
	intUnique: integer('int_unique').unique(),
});

export const intArrayTable = schema.table('int_array_table', {
	int: integer('int').array(),
});

export const booleanTable = schema.table('boolean_table', {
	boolean: boolean('boolean'),
});

export const booleanArrayTable = schema.table('boolean_array_table', {
	boolean: boolean('boolean').array(),
});

export const dateTable = schema.table('date_table', {
	date: date('date'),
});

// TODO: add tests for data type with different modes
export const dateArrayTable = schema.table('date_array_table', {
	date: date('date', { mode: 'date' }).array(),
	dateString: date('date_string', { mode: 'string' }).array(),
});

export const timeTable = schema.table('time_table', {
	time: time('time'),
});

export const timeArrayTable = schema.table('time_array_table', {
	time: time('time').array(),
});

export const timestampTable = schema.table('timestamp_table', {
	timestamp: timestamp('timestamp'),
});

export const timestampArrayTable = schema.table('timestamp_array_table', {
	timestamp: timestamp('timestamp').array(),
});

export const jsonTable = schema.table('json_table', {
	json: json('json'),
});

export const jsonArrayTable = schema.table('json_array_table', {
	json: json('json').array(),
});

export const intervalTable = schema.table('interval_table', {
	interval: interval('interval'),
});

export const intervalUniqueTable = schema.table('interval_unique_table', {
	intervalUnique: interval('interval_unique').unique(),
});

export const intervalArrayTable = schema.table('interval_array_table', {
	interval: interval('interval').array(),
});

export const stringTable = schema.table('string_table', {
	string: text('string'),
});

export const stringUniqueTable = schema.table('string_unique_table', {
	stringUnique: varchar('string_unique', { length: 256 }).unique(),
});

export const stringArrayTable = schema.table('string_array_table', {
	string: text('string').array(),
});

export const emailTable = schema.table('email_table', {
	email: varchar('email', { length: 256 }).unique(),
});

export const emailArrayTable = schema.table('email_array_table', {
	email: varchar('email', { length: 256 }).array(),
});

export const firstNameTable = schema.table('first_name_table', {
	firstName: varchar('first_name', { length: 256 }),
});

export const firstNameUniqueTable = schema.table('first_name_unique_table', {
	firstNameUnique: varchar('first_name_unique', { length: 256 }).unique(),
});

export const firstNameArrayTable = schema.table('first_name_array_table', {
	firstName: varchar('first_name', { length: 256 }).array(),
});

export const lastNameTable = schema.table('last_name_table', {
	lastName: varchar('last_name', { length: 256 }),
});

export const lastNameUniqueTable = schema.table('last_name_unique_table', {
	lastNameUnique: varchar('last_name_unique', { length: 256 }).unique(),
});

export const lastNameArrayTable = schema.table('last_name_array_table', {
	lastName: varchar('last_name', { length: 256 }).array(),
});

export const fullNameTable = schema.table('full_name__table', {
	fullName: varchar('full_name_', { length: 256 }),
});

export const fullNameUniqueTable = schema.table('full_name_unique_table', {
	fullNameUnique: varchar('full_name_unique', { length: 256 }).unique(),
});

export const fullNameArrayTable = schema.table('full_name_array_table', {
	fullName: varchar('full_name', { length: 256 }).array(),
});

export const countryTable = schema.table('country_table', {
	country: varchar('country', { length: 256 }),
});

export const countryUniqueTable = schema.table('country_unique_table', {
	countryUnique: varchar('country_unique', { length: 256 }).unique(),
});

export const countryArrayTable = schema.table('country_array_table', {
	country: varchar('country', { length: 256 }).array(),
});

export const cityTable = schema.table('city_table', {
	city: varchar('city', { length: 256 }),
});

export const cityUniqueTable = schema.table('city_unique_table', {
	cityUnique: varchar('city_unique', { length: 256 }).unique(),
});

export const cityArrayTable = schema.table('city_array_table', {
	city: varchar('city', { length: 256 }).array(),
});

export const streetAddressTable = schema.table('street_address_table', {
	streetAddress: varchar('street_address', { length: 256 }),
});

export const streetAddressUniqueTable = schema.table('street_address_unique_table', {
	streetAddressUnique: varchar('street_address_unique', { length: 256 }).unique(),
});

export const streetAddressArrayTable = schema.table('street_address_array_table', {
	streetAddress: varchar('street_address', { length: 256 }).array(),
});

export const jobTitleTable = schema.table('job_title_table', {
	jobTitle: text('job_title'),
});

export const jobTitleArrayTable = schema.table('job_title_array_table', {
	jobTitle: text('job_title').array(),
});

export const postcodeTable = schema.table('postcode_table', {
	postcode: varchar('postcode', { length: 256 }),
});

export const postcodeUniqueTable = schema.table('postcode_unique_table', {
	postcodeUnique: varchar('postcode_unique', { length: 256 }).unique(),
});

export const postcodeArrayTable = schema.table('postcode_array_table', {
	postcode: varchar('postcode', { length: 256 }).array(),
});

export const stateTable = schema.table('state_table', {
	state: text('state'),
});

export const stateArrayTable = schema.table('state_array_table', {
	state: text('state').array(),
});

export const companyNameTable = schema.table('company_name_table', {
	companyName: text('company_name'),
});

export const companyNameUniqueTable = schema.table('company_name_unique_table', {
	companyNameUnique: varchar('company_name_unique', { length: 256 }).unique(),
});

export const companyNameArrayTable = schema.table('company_name_array_table', {
	companyName: text('company_name').array(),
});

export const loremIpsumTable = schema.table('lorem_ipsum_table', {
	loremIpsum: text('lorem_ipsum'),
});

export const loremIpsumArrayTable = schema.table('lorem_ipsum_array_table', {
	loremIpsum: text('lorem_ipsum').array(),
});

export const pointTable = schema.table('point_table', {
	point: point('point'),
});

export const pointArrayTable = schema.table('point_array_table', {
	point: point('point').array(),
});

export const lineTable = schema.table('line_table', {
	line: line('line'),
});

export const lineArrayTable = schema.table('line_array_table', {
	line: line('line').array(),
});

// export const pointUniqueTable = schema.table("point_unique_table", {
//     pointUnique: point("point_unique").unique(),
// });

// export const lineUniqueTable = schema.table("line_unique_table", {
//     lineUnique: line("line_unique").unique(),
// });

export const phoneNumberTable = schema.table('phone_number_table', {
	phoneNumber: varchar('phoneNumber', { length: 256 }).unique(),
	phoneNumberTemplate: varchar('phone_number_template', { length: 256 }).unique(),
	phoneNumberPrefixes: varchar('phone_number_prefixes', { length: 256 }).unique(),
});

export const phoneNumberArrayTable = schema.table('phone_number_array_table', {
	phoneNumber: varchar('phoneNumber', { length: 256 }).array(),
	phoneNumberTemplate: varchar('phone_number_template', { length: 256 }).array(),
	phoneNumberPrefixes: varchar('phone_number_prefixes', { length: 256 }).array(),
});

export const weightedRandomTable = schema.table('weighted_random_table', {
	weightedRandom: varchar('weighted_random', { length: 256 }),
});

export const weightedRandomWithUniqueGensTable = schema.table('weighted_random_with_unique_gens_table', {
	weightedRandomWithUniqueGens: varchar('weighted_random_with_unique_gens', { length: 256 }).unique(),
});

export const identityColumnsTable = schema.table('identity_columns_table', {
	id: integer('id').generatedAlwaysAsIdentity(),
	id1: integer('id1'),
	name: text('name'),
});
