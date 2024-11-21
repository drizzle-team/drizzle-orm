import {
	boolean,
	date,
	integer,
	interval,
	json,
	line,
	pgSchema,
	point,
	real,
	text,
	time,
	timestamp,
	varchar,
} from 'drizzle-orm/pg-core';

export const schema = pgSchema('seeder_lib_pg');

export const moodEnum = schema.enum('enum', ['sad', 'ok', 'happy']);

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

export const jobTitleTable = schema.table('job_Title_table', {
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
