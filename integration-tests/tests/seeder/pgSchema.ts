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
});

// All generators tables -------------------------------
export const enumTable = schema.table('enum_table', {
	mood: moodEnum('mood_enum'),
});

export const defaultTable = schema.table('default_table', {
	defaultString: text('default_string'),
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

export const intPrimaryKeyTable = schema.table('int_primary_key_table', {
	intPrimaryKey: integer('int_primary_key').unique(),
});

export const numberTable = schema.table('number_table', {
	number: real('number'),
});

export const numberUniqueTable = schema.table('number_unique_table', {
	numberUnique: real('number_unique').unique(),
});

export const intTable = schema.table('int_table', {
	int: integer('int'),
});

export const intUniqueTable = schema.table('int_unique_table', {
	intUnique: integer('int_unique').unique(),
});

export const booleanTable = schema.table('boolean_table', {
	boolean: boolean('boolean'),
});

export const dateTable = schema.table('date_table', {
	date: date('date'),
});

export const timeTable = schema.table('time_table', {
	time: time('time'),
});

export const timestampTable = schema.table('timestamp_table', {
	timestamp: timestamp('timestamp'),
});

export const jsonTable = schema.table('json_table', {
	json: json('json'),
});

export const intervalTable = schema.table('interval_table', {
	interval: interval('interval'),
});

export const intervalUniqueTable = schema.table('interval_unique_table', {
	intervalUnique: interval('interval_unique').unique(),
});

export const stringTable = schema.table('string_table', {
	string: text('string'),
});

export const stringUniqueTable = schema.table('string_unique_table', {
	stringUnique: varchar('string_unique', { length: 256 }).unique(),
});

export const emailTable = schema.table('email_table', {
	email: varchar('email', { length: 256 }).unique(),
});

export const firstNameTable = schema.table('first_name_table', {
	firstName: varchar('first_name', { length: 256 }),
});

export const firstNameUniqueTable = schema.table('first_name_unique_table', {
	firstNameUnique: varchar('first_name_unique', { length: 256 }).unique(),
});

export const lastNameTable = schema.table('last_name_table', {
	lastName: varchar('last_name', { length: 256 }),
});

export const lastNameUniqueTable = schema.table('last_name_unique_table', {
	lastNameUnique: varchar('last_name_unique', { length: 256 }).unique(),
});

export const fullNameTable = schema.table('full_name__table', {
	fullName: varchar('full_name_', { length: 256 }),
});

export const fullNameUniqueTable = schema.table('full_name_unique_table', {
	fullNameUnique: varchar('full_name_unique', { length: 256 }).unique(),
});

export const countryTable = schema.table('country_table', {
	country: varchar('country', { length: 256 }),
});

export const countryUniqueTable = schema.table('country_unique_table', {
	countryUnique: varchar('country_unique', { length: 256 }).unique(),
});

export const cityTable = schema.table('city_table', {
	city: varchar('city', { length: 256 }),
});

export const cityUniqueTable = schema.table('city_unique_table', {
	cityUnique: varchar('city_unique', { length: 256 }).unique(),
});

export const streetAddressTable = schema.table('street_address_table', {
	streetAddress: varchar('street_address', { length: 256 }),
});

export const streetAddressUniqueTable = schema.table('street_address_unique_table', {
	streetAddressUnique: varchar('street_address_unique', { length: 256 }).unique(),
});

export const jobTitleTable = schema.table('job_title_table', {
	jobTitle: text('job_title'),
});

export const postcodeTable = schema.table('postcode_table', {
	postcode: varchar('postcode', { length: 256 }),
});

export const postcodeUniqueTable = schema.table('postcode_unique_table', {
	postcodeUnique: varchar('postcode_unique', { length: 256 }).unique(),
});

export const stateTable = schema.table('state_table', {
	state: text('state'),
});

export const companyNameTable = schema.table('company_name_table', {
	companyName: text('company_name'),
});

export const companyNameUniqueTable = schema.table('company_name_unique_table', {
	companyNameUnique: varchar('company_name_unique', { length: 256 }).unique(),
});

export const loremIpsumTable = schema.table('lorem_ipsum_table', {
	loremIpsum: text('lorem_ipsum'),
});

export const pointTable = schema.table('point_table', {
	point: point('point'),
});

export const lineTable = schema.table('line_table', {
	line: line('line'),
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
