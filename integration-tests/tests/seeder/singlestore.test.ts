import { sql } from 'drizzle-orm';
import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import { drizzle } from 'drizzle-orm/singlestore';
import * as mysql2 from 'mysql2/promise';
import { reset, seed } from 'drizzle-seed';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import * as schema from './singlestoreSchema.ts';

let client: mysql2.Connection;
let db: SingleStoreDatabase<any, any>;

// Helper function to cast the SingleStore database to work with seed/reset
// This is needed because drizzle-seed expects MySqlDatabase with a mode property
function asMySQLDatabase<T extends SingleStoreDatabase<any, any>>(database: T): MySqlDatabase<any, any, any, any> {
  return database as unknown as MySqlDatabase<any, any, any, any>;
}

// Get connection to SingleStore
async function getClient() {
  const connectionString = process.env['SINGLESTORE_CONNECTION_STRING'] ?? 
    'singlestore://root:singlestore@localhost:3306/drizzle';
  
  console.log('Connecting to SingleStore with connection string:', connectionString);
  
  try {
    const client = await mysql2.createConnection({ 
      uri: connectionString, 
      supportBigNumbers: true,
      // Set shorter timeout for local dev
      connectTimeout: 5000,
    });
    
    await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
    await client.changeUser({ database: 'drizzle' });
    
    return { client };
  } catch (error) {
    console.error('Error connecting to SingleStore:', error);
    throw error;
  }
}

async function createSingleStoreSchema(): Promise<void> {
	await createNorthwindTables();
	await createAllDataTypesTable();
	await createAllGeneratorsTables();
}

const createNorthwindTables = async () => {
	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS customer (
				id VARCHAR(256) NOT NULL,
				company_name TEXT NOT NULL,
				contact_name TEXT NOT NULL,
				contact_title TEXT NOT NULL,
				address TEXT NOT NULL,
				city TEXT NOT NULL,
				postal_code TEXT,
				region TEXT,
				country TEXT NOT NULL,
				phone TEXT NOT NULL,
				fax TEXT,
				PRIMARY KEY(id)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS order_detail (
				unit_price FLOAT NOT NULL,
				quantity INT NOT NULL,
				discount FLOAT NOT NULL,
				order_id INT NOT NULL,
				product_id INT NOT NULL
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS employee (
				id INT NOT NULL,
				last_name TEXT NOT NULL,
				first_name TEXT,
				title TEXT NOT NULL,
				title_of_courtesy TEXT NOT NULL,
				birth_date TIMESTAMP NOT NULL,
				hire_date TIMESTAMP NOT NULL,
				address TEXT NOT NULL,
				city TEXT NOT NULL,
				postal_code TEXT NOT NULL,
				country TEXT NOT NULL,
				home_phone TEXT NOT NULL,
				extension INT NOT NULL,
				notes TEXT NOT NULL,
				reports_to INT,
				photo_path TEXT,
				PRIMARY KEY(id)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS \`order\` (
				id INT NOT NULL,
				order_date TIMESTAMP NOT NULL,
				required_date TIMESTAMP NOT NULL,
				shipped_date TIMESTAMP,
				ship_via INT NOT NULL,
				freight FLOAT NOT NULL,
				ship_name TEXT NOT NULL,
				ship_city TEXT NOT NULL,
				ship_region TEXT,
				ship_postal_code TEXT,
				ship_country TEXT NOT NULL,
				customer_id VARCHAR(256) NOT NULL,
				employee_id INT NOT NULL,
				PRIMARY KEY(id)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS product (
				id INT NOT NULL,
				name TEXT NOT NULL,
				quantity_per_unit TEXT NOT NULL,
				unit_price FLOAT NOT NULL,
				units_in_stock INT NOT NULL,
				units_on_order INT NOT NULL,
				reorder_level INT NOT NULL,
				discontinued INT NOT NULL,
				supplier_id INT NOT NULL,
				PRIMARY KEY(id)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS supplier (
				id INT NOT NULL,
				company_name TEXT NOT NULL,
				contact_name TEXT NOT NULL,
				contact_title TEXT NOT NULL,
				address TEXT NOT NULL,
				city TEXT NOT NULL,
				region TEXT,
				postal_code TEXT NOT NULL,
				country TEXT NOT NULL,
				phone TEXT NOT NULL,
				PRIMARY KEY(id)
			);
		`,
	);

	// SingleStore doesn't support foreign key constraints, so we skip those
};

const createAllDataTypesTable = async () => {
	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS all_data_types (
				integer INT,
				tinyint TINYINT,
				smallint SMALLINT,
				mediumint MEDIUMINT,
				bigint BIGINT,
				bigint_number BIGINT,
				real REAL,
				decimal DECIMAL,
				double DOUBLE,
				float FLOAT,
				serial SERIAL AUTO_INCREMENT,
				binary BINARY(255),
				varbinary VARBINARY(256),
				char CHAR(255),
				varchar VARCHAR(256),
				text TEXT,
				boolean BOOLEAN,
				date_string DATE,
				date DATE,
				datetime DATETIME,
				datetimeString DATETIME,
				time TIME,
				timestamp_date TIMESTAMP,
				timestamp_string TIMESTAMP,
				json JSON,
				embedding VECTOR(128)
			);
		`,
	);
};

const createAllGeneratorsTables = async () => {
	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS datetime_table (
				datetime DATETIME
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS vector_table (
				id INT NOT NULL AUTO_INCREMENT,
				embedding VECTOR(1536),
				PRIMARY KEY(id)
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS document_table (
				id INT NOT NULL AUTO_INCREMENT,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				metadata JSON,
				embedding VECTOR(768),
				PRIMARY KEY(id)
			);
		`,
	);
};

beforeAll(async () => {
	// Get SingleStore client from common utility
	const result = await getClient();
	client = result.client;
	db = drizzle(client);

	// Create schema for tests
	await createSingleStoreSchema();
});

afterAll(async () => {
	await client.end().catch(console.error);
});

afterEach(async () => {
	await reset(asMySQLDatabase(db), schema);
});

test('basic seed test for SingleStore', async () => {
	await seed(asMySQLDatabase(db), schema);

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(10);
	expect(details.length).toBe(10);
	expect(employees.length).toBe(10);
	expect(orders.length).toBe(10);
	expect(products.length).toBe(10);
	expect(suppliers.length).toBe(10);
});

test('seed with options.count:11 test for SingleStore', async () => {
	await seed(asMySQLDatabase(db), schema, { count: 11 });

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(11);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(11);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test('redefine(refine) customers count for SingleStore', async () => {
	await seed(asMySQLDatabase(db), schema, { count: 11 }).refine(() => ({
		customers: {
			count: 12,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(12);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(11);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test('redefine(refine) all tables count for SingleStore', async () => {
	await seed(asMySQLDatabase(db), schema, { count: 11 }).refine(() => ({
		customers: {
			count: 12,
		},
		details: {
			count: 13,
		},
		employees: {
			count: 14,
		},
		orders: {
			count: 15,
		},
		products: {
			count: 16,
		},
		suppliers: {
			count: 17,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(12);
	expect(details.length).toBe(13);
	expect(employees.length).toBe(14);
	expect(orders.length).toBe(15);
	expect(products.length).toBe(16);
	expect(suppliers.length).toBe(17);
});

test("redefine(refine) orders count using 'with' in customers for SingleStore", async () => {
	await seed(asMySQLDatabase(db), schema, { count: 11 }).refine(() => ({
		customers: {
			count: 4,
			with: {
				orders: 2,
			},
		},
		orders: {
			count: 13,
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(4);
	expect(details.length).toBe(11);
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(8);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

test("sequential using of 'with' in SingleStore", async () => {
	await seed(asMySQLDatabase(db), schema, { count: 11 }).refine(() => ({
		customers: {
			count: 4,
			with: {
				orders: 2,
			},
		},
		orders: {
			count: 12,
			with: {
				details: 3,
			},
		},
	}));

	const customers = await db.select().from(schema.customers);
	const details = await db.select().from(schema.details);
	const employees = await db.select().from(schema.employees);
	const orders = await db.select().from(schema.orders);
	const products = await db.select().from(schema.products);
	const suppliers = await db.select().from(schema.suppliers);

	expect(customers.length).toBe(4);
	expect(details.length).toBe(24); // 8 orders × 3 details
	expect(employees.length).toBe(11);
	expect(orders.length).toBe(8);
	expect(products.length).toBe(11);
	expect(suppliers.length).toBe(11);
});

// All data types test -------------------------------
test('basic seed test for all SingleStore data types', async () => {
	await seed(asMySQLDatabase(db), schema, { count: 10 });

	const allDataTypes = await db.select().from(schema.allDataTypes);

	// every value in each row (except possibly null fields) should not be undefined
	const predicate = allDataTypes.every((row: any) => 
		Object.values(row).some((val: any) => val !== undefined)
	);

	expect(predicate).toBe(true);
	expect(allDataTypes.length).toBe(10);
});

// SingleStore vector tests -------------------------------
test('vector column generation in SingleStore', async () => {
	await seed(asMySQLDatabase(db), { vectorTable: schema.vectorTable }, { count: 5 });

	const vectors = await db.select().from(schema.vectorTable);
	
	expect(vectors.length).toBe(5);
	// Check that embeddings were generated with correct dimensions
	expect(vectors[0]!.embedding).toBeDefined();
	expect(Array.isArray(vectors[0]!.embedding)).toBe(true);
	expect(vectors[0]!.embedding!.length).toBe(1536);
});

test('document with embedding in SingleStore', async () => {
	await seed(asMySQLDatabase(db), { documentTable: schema.documentTable }, { count: 8 });

	const documents = await db.select().from(schema.documentTable);
	
	expect(documents.length).toBe(8);
	// Check document fields
	expect(documents[0]!.title).toBeDefined();
	expect(documents[0]!.content).toBeDefined();
	// Check embeddings with correct dimensions
	expect(documents[0]!.embedding).toBeDefined();
	expect(Array.isArray(documents[0]!.embedding)).toBe(true);
	expect(documents[0]!.embedding!.length).toBe(768);
});

test('datetime generator test for SingleStore', async () => {
	await seed(asMySQLDatabase(db), { datetimeTable: schema.datetimeTable }).refine((funcs) => ({
		datetimeTable: {
			count: 20,
			columns: {
				datetime: funcs.datetime(),
			},
		},
	}));

	const data = await db.select().from(schema.datetimeTable);
	// every value should be defined
	const predicate = data.length === 20 && 
		data.every((row: any) => row.datetime !== undefined && row.datetime !== null);
		
	expect(predicate).toBe(true);
});
