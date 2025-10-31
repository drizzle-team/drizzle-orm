import type { AnyCockroachColumn } from 'drizzle-orm/cockroach-core';
import { cockroachTable, int4, numeric, text, timestamp, varchar } from 'drizzle-orm/cockroach-core';

export const customers = cockroachTable('customer', {
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

export const employees = cockroachTable(
	'employee',
	{
		id: int4('id').primaryKey(),
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
		extension: int4('extension').notNull(),
		notes: text('notes').notNull(),
		reportsTo: int4('reports_to').references((): AnyCockroachColumn => employees.id),
		photoPath: text('photo_path'),
	},
);

export const orders = cockroachTable('order', {
	id: int4('id').primaryKey(),
	orderDate: timestamp('order_date').notNull(),
	requiredDate: timestamp('required_date').notNull(),
	shippedDate: timestamp('shipped_date'),
	shipVia: int4('ship_via').notNull(),
	freight: numeric('freight').notNull(),
	shipName: text('ship_name').notNull(),
	shipCity: text('ship_city').notNull(),
	shipRegion: text('ship_region'),
	shipPostalCode: text('ship_postal_code'),
	shipCountry: text('ship_country').notNull(),

	customerId: text('customer_id')
		.notNull()
		.references(() => customers.id, { onDelete: 'cascade' }),

	employeeId: int4('employee_id')
		.notNull()
		.references(() => employees.id, { onDelete: 'cascade' }),
});

export const suppliers = cockroachTable('supplier', {
	id: int4('id').primaryKey(),
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

export const products = cockroachTable('product', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
	quantityPerUnit: text('quantity_per_unit').notNull(),
	unitPrice: numeric('unit_price').notNull(),
	unitsInStock: int4('units_in_stock').notNull(),
	unitsOnOrder: int4('units_on_order').notNull(),
	reorderLevel: int4('reorder_level').notNull(),
	discontinued: int4('discontinued').notNull(),

	supplierId: int4('supplier_id')
		.notNull()
		.references(() => suppliers.id, { onDelete: 'cascade' }),
});

export const details = cockroachTable('order_detail', {
	unitPrice: numeric('unit_price').notNull(),
	quantity: int4('quantity').notNull(),
	discount: numeric('discount').notNull(),

	orderId: int4('order_id')
		.notNull()
		.references(() => orders.id, { onDelete: 'cascade' }),

	productId: int4('product_id')
		.notNull()
		.references(() => products.id, { onDelete: 'cascade' }),
});

export const identityColumnsTable = cockroachTable('identity_columns_table', {
	id: int4().generatedAlwaysAsIdentity(),
	id1: int4().generatedByDefaultAsIdentity(),
	name: text(),
});

export const users = cockroachTable(
	'users',
	{
		id: int4().primaryKey(),
		name: text(),
		invitedBy: int4().references((): AnyCockroachColumn => users.id),
	},
);

export const posts = cockroachTable(
	'posts',
	{
		id: int4().primaryKey(),
		name: text(),
		content: text(),
		userId: int4().references(() => users.id),
	},
);
