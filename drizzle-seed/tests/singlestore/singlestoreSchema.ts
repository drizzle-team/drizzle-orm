import { 
	singlestoreTable, 
	bigint, 
	float, 
	text, 
	timestamp, 
	varchar, 
	int,
	json,
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
		id: bigint('id', { mode: 'number' }).primaryKey(),
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
		reportsTo: bigint('reports_to', { mode: 'number' }), // No foreign key constraint
		photoPath: text('photo_path'),
	},
);

export const orders = singlestoreTable('order', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
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

	customerId: varchar('customer_id', { length: 256 }).notNull(), // No foreign key constraint

	employeeId: bigint('employee_id', { mode: 'number' }).notNull(), // No foreign key constraint
});

export const suppliers = singlestoreTable('supplier', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
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
	id: bigint('id', { mode: 'number' }).primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: float('unit_price').notNull(),
	unitsInStock: int('units_in_stock').notNull(),
	unitsOnOrder: int('units_on_order').notNull(),
	reorderLevel: int('reorder_level').notNull(),
	discontinued: int('discontinued').notNull(),

	supplierId: bigint('supplier_id', { mode: 'number' }).notNull(), // No foreign key constraint
});

export const details = singlestoreTable('order_detail', {
	unitPrice: float('unit_price').notNull(),
	quantity: int('quantity').notNull(),
	discount: float('discount').notNull(),

	orderId: bigint('order_id', { mode: 'number' }).notNull(), // No foreign key constraint

	productId: bigint('product_id', { mode: 'number' }).notNull(), // No foreign key constraint
});

export const users = singlestoreTable(
	'users',
	{
		id: bigint('id', { mode: 'number' }).primaryKey(),
		name: text('name'),
		invitedBy: bigint('invitedBy', { mode: 'number' }), // No foreign key constraint
	},
);

export const posts = singlestoreTable(
	'posts',
	{
		id: bigint('id', { mode: 'number' }).primaryKey(),
		name: text('name'),
		content: text('content'),
		userId: bigint('userId', { mode: 'number' }), // No foreign key constraint
	},
);

// SingleStore-specific tables with vector support and JSON
export const aiDocuments = singlestoreTable('ai_documents', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	title: varchar('title', { length: 255 }).notNull(),
	content: text('content').notNull(),
	embedding: vector('embedding', { dimensions: 1536 }), // OpenAI embeddings
	metadata: json('metadata'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
