import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import {
	bigint,
	binary,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	mediumint,
	mysqlEnum,
	mysqlTable,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';

export const customers = mysqlTable('customer', {
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

export const employees = mysqlTable(
	'employee',
	{
		id: int('id').primaryKey(),
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
		extension: int('extension').notNull(),
		notes: text('notes').notNull(),
		reportsTo: int('reports_to').references((): AnyMySqlColumn => employees.id),
		photoPath: text('photo_path'),
	},
);

export const orders = mysqlTable('order', {
	id: int('id').primaryKey(),
	orderDate: timestamp('order_date').notNull(),
	requiredDate: timestamp('required_date').notNull(),
	shippedDate: timestamp('shipped_date'),
	shipVia: int('ship_via').notNull(),
	freight: float('freight').notNull(),
	shipName: text('ship_name').notNull(),
	shipCity: text('ship_city').notNull(),
	shipRegion: text('ship_region'),
	shipPostalCode: text('ship_postal_code'),
	shipCountry: text('ship_country').notNull(),

	customerId: varchar('customer_id', { length: 256 })
		.notNull()
		.references(() => customers.id, { onDelete: 'cascade' }),

	employeeId: int('employee_id')
		.notNull()
		.references(() => employees.id, { onDelete: 'cascade' }),
});

export const suppliers = mysqlTable('supplier', {
	id: int('id').primaryKey(),
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

export const products = mysqlTable('product', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: float('unit_price').notNull(),
	unitsInStock: int('units_in_stock').notNull(),
	unitsOnOrder: int('units_on_order').notNull(),
	reorderLevel: int('reorder_level').notNull(),
	discontinued: int('discontinued').notNull(),

	supplierId: int('supplier_id')
		.notNull()
		.references(() => suppliers.id, { onDelete: 'cascade' }),
});

export const details = mysqlTable('order_detail', {
	unitPrice: float('unit_price').notNull(),
	quantity: int('quantity').notNull(),
	discount: float('discount').notNull(),

	orderId: int('order_id')
		.notNull()
		.references(() => orders.id, { onDelete: 'cascade' }),

	productId: int('product_id')
		.notNull()
		.references(() => products.id, { onDelete: 'cascade' }),
});

// All data types table -------------------------------
export const allDataTypes = mysqlTable('all_data_types', {
	int: int('integer'),
	tinyint: tinyint('tinyint'),
	smallint: smallint('smallint'),
	mediumint: mediumint('mediumint'),
	biginteger: bigint('bigint', { mode: 'bigint' }),
	bigintNumber: bigint('bigint_number', { mode: 'number' }),
	real: real('real'),
	decimal: decimal('decimal'),
	double: double('double'),
	float: float('float'),
	serial: serial('serial'),
	binary: binary('binary', { length: 255 }),
	varbinary: varbinary('varbinary', { length: 256 }),
	char: char('char', { length: 255 }),
	varchar: varchar('varchar', { length: 256 }),
	text: text('text'),
	boolean: boolean('boolean'),
	dateString: date('date_string', { mode: 'string' }),
	date: date('date', { mode: 'date' }),
	datetime: datetime('datetime', { mode: 'date' }),
	datetimeString: datetime('datetimeString', { mode: 'string' }),
	time: time('time'),
	year: year('year'),
	timestampDate: timestamp('timestamp_date', { mode: 'date' }),
	timestampString: timestamp('timestamp_string', { mode: 'string' }),
	json: json('json'),
	mysqlEnum: mysqlEnum('popularity', ['unknown', 'known', 'popular']),
});

// All generators tables -------------------------------
export const datetimeTable = mysqlTable('datetime_table', {
	datetime: datetime('datetime'),
});

export const yearTable = mysqlTable('year_table', {
	year: year('year'),
});
