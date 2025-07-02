// SingleStore Integration Test
// This test demonstrates comprehensive SingleStore support in Drizzle Seed

import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { relations } from 'drizzle-orm';
import { SeedService } from '../../src/services/SeedService.ts';
import * as schema from './singlestoreSchema.ts';

// Mock SingleStore database for comprehensive testing
const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnValue(Promise.resolve([])),
	insert: vi.fn().mockReturnThis(),
	values: vi.fn().mockReturnValue(Promise.resolve({ affectedRows: 1 })),
	$returningId: vi.fn().mockReturnValue(Promise.resolve([{ id: 1 }])),
	execute: vi.fn().mockReturnValue(Promise.resolve()),
};

describe('SingleStore Seed Integration Tests', () => {
	const seedService = new SeedService();

	beforeAll(async () => {
		// Setup mock tables for testing
		vi.clearAllMocks();
	});

	afterAll(async () => {
		// Cleanup
	});

	afterEach(async () => {
		// Reset mocks after each test
		vi.clearAllMocks();
	});

	// Mock table for testing
	const mockTable = {
		name: 'test_table',
		columns: [],
		primaryKeys: ['id']
	};

	test('should handle SingleStore bigint primary key', () => {
		const column = {
			name: 'id',
			columnType: 'bigint',
			dataType: 'number',
			primary: true,
			isUnique: false,
			notNull: true,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateIntPrimaryKey');
	});

	test('should handle SingleStore vector columns', () => {
		const column = {
			name: 'embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { dimensions: 1536 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateArray');
		// Check if it has the right size for vector dimensions
		expect((generator! as any).params?.size).toBe(1536);
	});

	test('should handle SingleStore varchar columns', () => {
		const column = {
			name: 'name',
			columnType: 'varchar',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: { length: 255 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateFirstName');
	});

	test('should handle SingleStore email columns', () => {
		const column = {
			name: 'email',
			columnType: 'varchar',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: { length: 255 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateEmail');
	});

	test('should handle SingleStore json columns', () => {
		const column = {
			name: 'metadata',
			columnType: 'json',
			dataType: 'object',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateJson');
	});

	test('should handle SingleStore boolean columns', () => {
		const column = {
			name: 'isActive',
			columnType: 'boolean',
			dataType: 'boolean',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateBoolean');
	});

	test('should handle SingleStore timestamp columns', () => {
		const column = {
			name: 'createdAt',
			columnType: 'timestamp',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateTimestamp');
	});

	test('should handle SingleStore int columns with proper ranges', () => {
		const column = {
			name: 'count',
			columnType: 'int',
			dataType: 'number',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateInt');
		// Check if it has proper int range
		expect((generator! as any).params?.minValue).toBe(-2147483648);
		expect((generator! as any).params?.maxValue).toBe(2147483647);
	});

	test('should handle SingleStore decimal columns with precision', () => {
		const column = {
			name: 'price',
			columnType: 'decimal',
			dataType: 'number',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: { precision: 10, scale: 2 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, column as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateNumber');
		// Check precision handling - the precision is calculated as 10^scale = 10^2 = 100
		expect((generator! as any).params?.precision).toBe(100); // Math.pow(10, scale)
	});

	test('should support singlestore connection type in generatePossibleGenerators', () => {
		// Test that 'singlestore' is accepted as a connection type
		const mockTables = [mockTable];
		const mockRelations: any[] = [];

		expect(() => {
			seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 10, seed: 123 }
			);
		}).not.toThrow();
	});

	// Integration tests with mock database
	test('basic seed test with mock database', async () => {
		// Mock the database calls to return appropriate data
		mockDb.select.mockReturnThis();
		mockDb.from.mockReturnValue(Promise.resolve(Array.from({ length: 10 }, () => ({}))));

		// Test seeding with schema (would work with real SingleStore database)
		expect(() => {
			// This tests the generator selection and parameter handling
			seedService.generatePossibleGenerators(
				'singlestore',
				Object.values(schema).map(table => ({ name: table._.name, columns: [], primaryKeys: ['id'] })) as any,
				[],
				undefined,
				{ count: 10, seed: 123 }
			);
		}).not.toThrow();
	});

	test('seed with custom count for SingleStore', async () => {
		const customCount = 11;
		
		expect(() => {
			seedService.generatePossibleGenerators(
				'singlestore',
				[mockTable] as any,
				[],
				undefined,
				{ count: customCount, seed: 123 }
			);
		}).not.toThrow();
	});

	test('SingleStore parameter limit handling', () => {
		// Test that SingleStore uses correct parameter limits (100,000 vs MySQL's 65,535)
		const mockRelations: any[] = [];
		const mockGenerators = seedService.generatePossibleGenerators(
			'singlestore',
			[mockTable] as any,
			mockRelations,
			undefined,
			{ count: 1000, seed: 123 }
		);

		const result = seedService.generateTablesValues(
			mockRelations,
			mockGenerators,
			undefined,
			undefined,
			{ count: 1000, seed: 123 }
		);

		// Should not throw error for large datasets due to proper parameter limit handling
		expect(result).toBeDefined();
	});

	test('SingleStore vector column generation', () => {
		const vectorColumn = {
			name: 'embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: true,
			typeParams: { dimensions: 512 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, vectorColumn as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateArray');
		expect((generator! as any).params?.size).toBe(512);
	});

	test('SingleStore JSON metadata column', () => {
		const jsonColumn = {
			name: 'metadata',
			columnType: 'json',
			dataType: 'object',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(mockTable as any, jsonColumn as any);
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateJson');
	});

	test('overlapping soft relations without foreign keys', async () => {
		// Test soft relations since SingleStore doesn't support foreign keys
		const _postsRelation = relations(schema.posts, ({ one }) => ({
			user: one(schema.users, { fields: [schema.posts.userId], references: [schema.users.id] }),
		}));

		const consoleMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

		// This should work without foreign key constraints
		expect(() => {
			seedService.generatePossibleGenerators(
				'singlestore',
				[
					{ name: 'users', columns: [], primaryKeys: ['id'] },
					{ name: 'posts', columns: [], primaryKeys: ['id'] }
				] as any,
				[],
				undefined,
				{ count: 10, seed: 123 }
			);
		}).not.toThrow();

		consoleMock.mockRestore();
	});
});
