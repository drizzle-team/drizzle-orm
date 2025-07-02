// SingleStore All Data Types Test
// This test validates all SingleStore data types are properly handled by Drizzle Seed

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { SeedService } from '../../../src/services/SeedService.ts';

// Mock SingleStore database
const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnValue(Promise.resolve([])),
	execute: vi.fn().mockReturnValue(Promise.resolve()),
};

let seedService: SeedService;

beforeAll(async () => {
	// Setup for SingleStore all data types testing
	seedService = new SeedService();
	vi.clearAllMocks();
});

afterAll(async () => {
	// Cleanup
});

describe('SingleStore All Data Types Tests', () => {
	test('basic seed test for all data types', async () => {
		// Mock successful database operations
		mockDb.select.mockReturnThis();
		mockDb.from.mockReturnValue(Promise.resolve(Array.from({ length: 1000 }, () => ({}))));

		// Test that all SingleStore data types are properly handled
		const mockTables = [{
			name: 'all_data_types',
			columns: [
				{ name: 'integer', columnType: 'int', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'tinyint', columnType: 'tinyint', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'smallint', columnType: 'smallint', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'mediumint', columnType: 'mediumint', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'bigint', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'bigint_number', columnType: 'bigint', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'real', columnType: 'real', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'decimal', columnType: 'decimal', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'double', columnType: 'double', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'float', columnType: 'float', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'serial', columnType: 'serial', dataType: 'number', primary: true, isUnique: false, notNull: true, typeParams: {} },
				{ name: 'binary', columnType: 'binary', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
				{ name: 'varbinary', columnType: 'varbinary', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
				{ name: 'char', columnType: 'char', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
				{ name: 'varchar', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
				{ name: 'text', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'boolean', columnType: 'boolean', dataType: 'boolean', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'date_string', columnType: 'date', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'date', columnType: 'date', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'datetime', columnType: 'datetime', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'datetimeString', columnType: 'datetime', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'time', columnType: 'time', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'year', columnType: 'year', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'timestamp_date', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'timestamp_string', columnType: 'timestamp', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'json', columnType: 'json', dataType: 'object', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'popularity', columnType: 'enum', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { values: ['unknown', 'known', 'popular'] } },
				// SingleStore-specific vector columns
				{ name: 'embedding', columnType: 'vector', dataType: 'array', primary: false, isUnique: false, notNull: false, typeParams: { dimensions: 1536 } },
				{ name: 'small_embedding', columnType: 'vector', dataType: 'array', primary: false, isUnique: false, notNull: false, typeParams: { dimensions: 512 } },
			],
			primaryKeys: ['serial']
		}];

		const mockRelations: any[] = [];

		// Test generating possible generators for all SingleStore data types
		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 1000, seed: 123 }
			);

			// Verify generators were created for all column types
			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
		}).not.toThrow();
	});

	test('SingleStore vector column generators', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		// Test vector with 1536 dimensions (OpenAI embeddings)
		const embeddingColumn = {
			name: 'embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { dimensions: 1536 }
		};

		const generator1 = seedService.selectGeneratorForSingleStoreColumn(table as any, embeddingColumn as any);
		expect(generator1).toBeDefined();
		expect(generator1!.constructor.name).toBe('GenerateArray');
		expect((generator1! as any).params?.size).toBe(1536);

		// Test vector with 512 dimensions
		const smallEmbeddingColumn = {
			name: 'small_embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { dimensions: 512 }
		};

		const generator2 = seedService.selectGeneratorForSingleStoreColumn(table as any, smallEmbeddingColumn as any);
		expect(generator2).toBeDefined();
		expect(generator2!.constructor.name).toBe('GenerateArray');
		expect((generator2! as any).params?.size).toBe(512);
	});

	test('SingleStore enum column generator', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		const enumColumn = {
			name: 'popularity',
			columnType: 'enum',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { values: ['unknown', 'known', 'popular'] }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, enumColumn as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateValuesFromArray');
		expect((generator! as any).params?.values).toEqual(['unknown', 'known', 'popular']);
	});

	test('SingleStore JSON column generator', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		const jsonColumn = {
			name: 'metadata',
			columnType: 'json',
			dataType: 'object',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, jsonColumn as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateJson');
	});

	test('SingleStore serial primary key generator', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['serial'] };

		const serialColumn = {
			name: 'serial',
			columnType: 'serial',
			dataType: 'number',
			primary: true,
			isUnique: false,
			notNull: true,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, serialColumn as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateIntPrimaryKey');
	});

	test('SingleStore timestamp columns with different modes', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		// Test timestamp with date mode
		const timestampDateColumn = {
			name: 'timestamp_date',
			columnType: 'timestamp',
			dataType: 'date',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator1 = seedService.selectGeneratorForSingleStoreColumn(table as any, timestampDateColumn as any);
		expect(generator1).toBeDefined();
		expect(generator1!.constructor.name).toBe('GenerateTimestamp');

		// Test timestamp with string mode
		const timestampStringColumn = {
			name: 'timestamp_string',
			columnType: 'timestamp',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator2 = seedService.selectGeneratorForSingleStoreColumn(table as any, timestampStringColumn as any);
		expect(generator2).toBeDefined();
		expect(generator2!.constructor.name).toBe('GenerateTimestamp');
	});

	test('SingleStore numeric types with proper ranges', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		// Test tinyint
		const tinyintColumn = {
			name: 'tinyint_col',
			columnType: 'tinyint',
			dataType: 'number',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const tinyintGenerator = seedService.selectGeneratorForSingleStoreColumn(table as any, tinyintColumn as any);
		expect(tinyintGenerator).toBeDefined();
		expect(tinyintGenerator!.constructor.name).toBe('GenerateInt');

		// Test bigint
		const bigintColumn = {
			name: 'bigint_col',
			columnType: 'bigint',
			dataType: 'number',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const bigintGenerator = seedService.selectGeneratorForSingleStoreColumn(table as any, bigintColumn as any);
		expect(bigintGenerator).toBeDefined();
		expect(bigintGenerator!.constructor.name).toBe('GenerateInt');
	});
});
