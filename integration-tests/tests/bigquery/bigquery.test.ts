import { BigQuery } from '@google-cloud/bigquery';
import { sql } from 'drizzle-orm';
import type { NodeBigQueryDatabase } from 'drizzle-orm/bigquery';
import { drizzle } from 'drizzle-orm/bigquery';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { aggregateTable, ordersTable, tests, usersTable } from './bigquery-common';

const ENABLE_LOGGING = false;

// BigQuery project and dataset configuration - required environment variables
const PROJECT_ID = process.env['BIGQUERY_PROJECT_ID'];
const DATASET_ID = process.env['BIGQUERY_DATASET_ID'] || 'drizzle_test';

if (!PROJECT_ID) {
	throw new Error('BIGQUERY_PROJECT_ID environment variable is required');
}

let db: NodeBigQueryDatabase;
let bigquery: BigQuery;

beforeAll(async () => {
	bigquery = new BigQuery({
		projectId: PROJECT_ID,
	});

	db = drizzle(bigquery, { logger: ENABLE_LOGGING });

	// Create test dataset if it doesn't exist
	try {
		await bigquery.createDataset(DATASET_ID, { location: 'US' });
		console.log(`Created dataset ${DATASET_ID}`);
	} catch (error: any) {
		if (error.code !== 409) {
			// 409 = Already exists
			throw error;
		}
	}

	// Create test tables
	await createTestTables();
});

afterAll(async () => {
	// Optionally clean up test dataset
	// await bigquery.dataset(DATASET_ID).delete({ force: true });
});

beforeEach((ctx) => {
	ctx.bigquery = {
		db,
	};
});

async function createTestTables() {
	const dataset = bigquery.dataset(DATASET_ID);

	// Users table
	try {
		await dataset.createTable('users', {
			schema: {
				fields: [
					{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'name', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'email', type: 'STRING', mode: 'NULLABLE' },
					{ name: 'verified', type: 'BOOL', mode: 'NULLABLE' },
					{ name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
				],
			},
		});
		console.log('Created users table');
	} catch (error: any) {
		if (error.code !== 409) throw error;
	}

	// Orders table
	try {
		await dataset.createTable('orders', {
			schema: {
				fields: [
					{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'product', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'quantity', type: 'INT64', mode: 'REQUIRED' },
					{ name: 'price', type: 'FLOAT64', mode: 'REQUIRED' },
					{ name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
				],
			},
		});
		console.log('Created orders table');
	} catch (error: any) {
		if (error.code !== 409) throw error;
	}

	// Aggregate test table
	try {
		await dataset.createTable('aggregate_table', {
			schema: {
				fields: [
					{ name: 'id', type: 'INT64', mode: 'REQUIRED' },
					{ name: 'name', type: 'STRING', mode: 'REQUIRED' },
					{ name: 'a', type: 'INT64', mode: 'NULLABLE' },
					{ name: 'b', type: 'INT64', mode: 'NULLABLE' },
					{ name: 'c', type: 'INT64', mode: 'NULLABLE' },
					{ name: 'null_only', type: 'INT64', mode: 'NULLABLE' },
				],
			},
		});
		console.log('Created aggregate_table');
	} catch (error: any) {
		if (error.code !== 409) throw error;
	}
}

// BigQuery-specific tests
test('drizzle instance has $client', () => {
	expect(db.$client).toBe(bigquery);
});

test('execute raw query', async () => {
	const result = await db.execute(sql`SELECT 1 + 1 as result`);
	expect(result).toEqual([{ result: 2 }]);
});

test('toSQL returns correct BigQuery syntax', () => {
	const query = db.select().from(usersTable).where(sql`${usersTable.name} = 'John'`);
	const sqlResult = query.toSQL();

	// BigQuery uses backticks for identifiers
	expect(sqlResult.sql).toContain('`');
	expect(sqlResult.sql).toContain('drizzle_test.users');
});

test('parameters use positional placeholders', () => {
	const query = db.select().from(usersTable).limit(10);
	const sqlResult = query.toSQL();

	// BigQuery uses ? for positional parameters
	expect(sqlResult.sql).toContain('?');
	expect(sqlResult.params).toContain(10);
});

// Run the common tests
tests();
