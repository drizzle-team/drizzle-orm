import { relations } from 'drizzle-orm/_relations';
import { cockroachTable, int4, numeric, string, timestamp, varchar } from 'drizzle-orm/cockroach-core';

export const customers = cockroachTable('customer', {
	id: varchar('id', { length: 256 }).primaryKey(),
	companyName: string('company_name').notNull(),
	contactName: string('contact_name').notNull(),
	contactTitle: string('contact_title').notNull(),
	address: string('address').notNull(),
	city: string('city').notNull(),
	postalCode: string('postal_code'),
	region: string('region'),
	country: string('country').notNull(),
	phone: string('phone').notNull(),
	fax: string('fax'),
});

export const employees = cockroachTable(
	'employee',
	{
		id: int4('id').primaryKey(),
		lastName: string('last_name').notNull(),
		firstName: string('first_name'),
		title: string('title').notNull(),
		titleOfCourtesy: string('title_of_courtesy').notNull(),
		birthDate: timestamp('birth_date').notNull(),
		hireDate: timestamp('hire_date').notNull(),
		address: string('address').notNull(),
		city: string('city').notNull(),
		postalCode: string('postal_code').notNull(),
		country: string('country').notNull(),
		homePhone: string('home_phone').notNull(),
		extension: int4('extension').notNull(),
		notes: string('notes').notNull(),
		reportsTo: int4('reports_to'),
		photoPath: string('photo_path'),
	},
);

export const employeesRelations = relations(employees, ({ one }) => ({
	employee: one(employees, {
		fields: [employees.reportsTo],
		references: [employees.id],
	}),
}));

export const orders = cockroachTable('order', {
	id: int4('id').primaryKey(),
	orderDate: timestamp('order_date').notNull(),
	requiredDate: timestamp('required_date').notNull(),
	shippedDate: timestamp('shipped_date'),
	shipVia: int4('ship_via').notNull(),
	freight: numeric('freight').notNull(),
	shipName: string('ship_name').notNull(),
	shipCity: string('ship_city').notNull(),
	shipRegion: string('ship_region'),
	shipPostalCode: string('ship_postal_code'),
	shipCountry: string('ship_country').notNull(),

	customerId: string('customer_id').notNull(),

	employeeId: int4('employee_id').notNull(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id],
	}),
	employee: one(employees, {
		fields: [orders.employeeId],
		references: [employees.id],
	}),
}));

export const suppliers = cockroachTable('supplier', {
	id: int4('id').primaryKey(),
	companyName: string('company_name').notNull(),
	contactName: string('contact_name').notNull(),
	contactTitle: string('contact_title').notNull(),
	address: string('address').notNull(),
	city: string('city').notNull(),
	region: string('region'),
	postalCode: string('postal_code').notNull(),
	country: string('country').notNull(),
	phone: string('phone').notNull(),
});

export const products = cockroachTable('product', {
	id: int4('id').primaryKey(),
	name: string('name').notNull(),
	quantityPerUnit: string('quantity_per_unit').notNull(),
	unitPrice: numeric('unit_price').notNull(),
	unitsInStock: int4('units_in_stock').notNull(),
	unitsOnOrder: int4('units_on_order').notNull(),
	reorderLevel: int4('reorder_level').notNull(),
	discontinued: int4('discontinued').notNull(),

	supplierId: int4('supplier_id').notNull(),
});

export const productsRelations = relations(products, ({ one }) => ({
	supplier: one(suppliers, {
		fields: [products.supplierId],
		references: [suppliers.id],
	}),
}));

export const details = cockroachTable('order_detail', {
	unitPrice: numeric('unit_price').notNull(),
	quantity: int4('quantity').notNull(),
	discount: numeric('discount').notNull(),

	orderId: int4('order_id').notNull(),

	productId: int4('product_id').notNull(),
});

export const detailsRelations = relations(details, ({ one }) => ({
	order: one(orders, {
		fields: [details.orderId],
		references: [orders.id],
	}),
	product: one(products, {
		fields: [details.productId],
		references: [products.id],
	}),
}));
