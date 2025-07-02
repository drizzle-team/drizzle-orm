// Import singlestore-core modules for schema definition
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
	real,
	serial,
	smallint,
	singlestoreTable,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	vector,
} from 'drizzle-orm/singlestore-core';

export const customers = singlestoreTable('customer', {
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

export const employees = singlestoreTable(
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
		// SingleStore doesn't support references with circular table references
		reportsTo: int('reports_to'),
		photoPath: text('photo_path'),
	},
);

export const orders = singlestoreTable('order', {
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

	// SingleStore doesn't support foreign key constraints
	customerId: varchar('customer_id', { length: 256 }).notNull(),
	employeeId: int('employee_id').notNull(),
});

export const suppliers = singlestoreTable('supplier', {
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

export const products = singlestoreTable('product', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: float('unit_price').notNull(),
	unitsInStock: int('units_in_stock').notNull(),
	unitsOnOrder: int('units_on_order').notNull(),
	reorderLevel: int('reorder_level').notNull(),
	discontinued: int('discontinued').notNull(),

	// SingleStore doesn't support foreign key constraints
	supplierId: int('supplier_id').notNull(),
});

export const details = singlestoreTable('order_detail', {
	unitPrice: float('unit_price').notNull(),
	quantity: int('quantity').notNull(),
	discount: float('discount').notNull(),

	// SingleStore doesn't support foreign key constraints
	orderId: int('order_id').notNull(),
	productId: int('product_id').notNull(),
});

// All data types table -------------------------------
export const allDataTypes = singlestoreTable('all_data_types', {
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
	timestampDate: timestamp('timestamp_date', { mode: 'date' }),
	timestampString: timestamp('timestamp_string', { mode: 'string' }),
	json: json('json'),
	// Vector type - SingleStore specific
	embedding: vector('embedding', { dimensions: 128 }),
});

// All generators tables -------------------------------
export const datetimeTable = singlestoreTable('datetime_table', {
	datetime: datetime('datetime'),
});

// Vector embedding table - SingleStore specific
export const vectorTable = singlestoreTable('vector_table', {
	id: int('id').primaryKey().autoincrement(),
	embedding: vector('embedding', { dimensions: 1536 }),
});

// Document with embeddings table - SingleStore specific
export const documentTable = singlestoreTable('document_table', {
	id: int('id').primaryKey().autoincrement(),
	title: text('title').notNull(),
	content: text('content').notNull(),
	metadata: json('metadata'),
	embedding: vector('embedding', { dimensions: 768 }),
});
