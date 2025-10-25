import type { AnyMsSqlColumn } from 'drizzle-orm/mssql-core';
import { datetime, float, int, mssqlTable, text, varchar } from 'drizzle-orm/mssql-core';

export const customers = mssqlTable('customer', {
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

export const employees = mssqlTable(
	'employee',
	{
		id: int('id').primaryKey(),
		lastName: text('last_name').notNull(),
		firstName: text('first_name'),
		title: text('title').notNull(),
		titleOfCourtesy: text('title_of_courtesy').notNull(),
		birthDate: datetime('birth_date').notNull(),
		hireDate: datetime('hire_date').notNull(),
		address: text('address').notNull(),
		city: text('city').notNull(),
		postalCode: text('postal_code').notNull(),
		country: text('country').notNull(),
		homePhone: text('home_phone').notNull(),
		extension: int('extension').notNull(),
		notes: text('notes').notNull(),
		reportsTo: int('reports_to').references((): AnyMsSqlColumn => employees.id),
		photoPath: text('photo_path'),
	},
);

export const orders = mssqlTable('order', {
	id: int('id').primaryKey(),
	orderDate: datetime('order_date').notNull(),
	requiredDate: datetime('required_date').notNull(),
	shippedDate: datetime('shipped_date'),
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

export const suppliers = mssqlTable('supplier', {
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

export const products = mssqlTable('product', {
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

export const details = mssqlTable('order_detail', {
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

export const users = mssqlTable(
	'users',
	{
		id: int().primaryKey(),
		name: text(),
		invitedBy: int().references((): AnyMsSqlColumn => users.id),
	},
);

export const posts = mssqlTable(
	'posts',
	{
		id: int().primaryKey(),
		name: text(),
		content: text(),
		userId: int().references(() => users.id),
	},
);
