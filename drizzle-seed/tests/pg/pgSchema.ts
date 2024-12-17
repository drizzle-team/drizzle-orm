// import { serial, integer, varchar, pgSchema, getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";

// export const schema = pgSchema("seeder_lib_pg");

// export const users = schema.table("users", {
//     id: serial("id").primaryKey(),
//     name: varchar("name", { length: 256 }),
//     email: varchar("email", { length: 256 }),
//     phone: varchar("phone", { length: 256 }),
//     password: varchar("password", { length: 256 })
// });

// export const posts = schema.table("posts", {
//     id: serial("id").primaryKey(),
//     title: varchar("title", { length: 256 }),
//     content: varchar("content", { length: 256 }),
//     userId: integer("user_id").references(() => users.id)
// });

// export const comments = schema.table("comments", {
//     id: serial("id").primaryKey(),
//     content: varchar("content", { length: 256 }),
//     postId: integer("post_id").references(() => posts.id),
//     userId: integer("user_id").references(() => users.id)
// });

import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { integer, numeric, pgSchema, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

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

export const identityColumnsTable = schema.table('identity_columns_table', {
	id: integer().generatedAlwaysAsIdentity(),
	id1: integer().generatedByDefaultAsIdentity(),
	name: text(),
});

export const user = schema.table(
	'user',
	{
		id: serial().primaryKey(),
		name: text(),
		invitedBy: integer().references((): AnyPgColumn => user.id),
	},
);
