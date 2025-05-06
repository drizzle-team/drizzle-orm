import { foreignKey, integer, numeric, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const customers = sqliteTable('customer', {
	id: text('id').primaryKey(),
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

export const employees = sqliteTable(
	'employee',
	{
		id: integer('id').primaryKey(),
		lastName: text('last_name').notNull(),
		firstName: text('first_name'),
		title: text('title').notNull(),
		titleOfCourtesy: text('title_of_courtesy').notNull(),
		birthDate: integer('birth_date', { mode: 'timestamp' }).notNull(),
		hireDate: integer('hire_date', { mode: 'timestamp' }).notNull(),
		address: text('address').notNull(),
		city: text('city').notNull(),
		postalCode: text('postal_code').notNull(),
		country: text('country').notNull(),
		homePhone: text('home_phone').notNull(),
		extension: integer('extension').notNull(),
		notes: text('notes').notNull(),
		reportsTo: integer('reports_to'),
		photoPath: text('photo_path'),
	},
	(table) => [foreignKey({
		columns: [table.reportsTo],
		foreignColumns: [table.id],
	})],
);

export const orders = sqliteTable('order', {
	id: integer('id').primaryKey(),
	orderDate: integer('order_date', { mode: 'timestamp' }).notNull(),
	requiredDate: integer('required_date', { mode: 'timestamp' }).notNull(),
	shippedDate: integer('shipped_date', { mode: 'timestamp' }),
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

export const suppliers = sqliteTable('supplier', {
	id: integer('id').primaryKey({ autoIncrement: true }),
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

export const products = sqliteTable('product', {
	id: integer('id').primaryKey({ autoIncrement: true }),
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

export const details = sqliteTable('order_detail', {
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

export const users = sqliteTable(
	'users',
	{
		id: integer().primaryKey(),
		name: text(),
		invitedBy: integer(),
	},
	(table) => [foreignKey({
		columns: [table.invitedBy],
		foreignColumns: [table.id],
	})],
);

export const posts = sqliteTable(
	'posts',
	{
		id: integer().primaryKey(),
		name: text(),
		content: text(),
		userId: integer().references(() => users.id),
	},
);
