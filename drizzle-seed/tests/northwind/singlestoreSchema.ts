// Import singlestore-core modules for schema definition
import {
	float, 
	int, 
	singlestoreTable, 
	text, 
	timestamp, 
	varchar,
	vector
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
		// SingleStore doesn't support self-referencing foreign keys
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

// SingleStore-specific table with vector support
export const documentEmbeddings = singlestoreTable('document_embedding', {
	id: int('id').primaryKey(),
	title: text('title').notNull(),
	content: text('content').notNull(),
	embedding: vector('embedding', { dimensions: 1536 }),
});
