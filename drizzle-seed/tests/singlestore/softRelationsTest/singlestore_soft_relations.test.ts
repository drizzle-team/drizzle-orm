// SingleStore Soft Relations Test
// Tests soft relationship handling since SingleStore doesn't support foreign keys

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { SeedService } from '../../../src/services/SeedService.ts';

// Mock SingleStore database
const _mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnValue(Promise.resolve([])),
	execute: vi.fn().mockReturnValue(Promise.resolve()),
};

let seedService: SeedService;

beforeAll(async () => {
	// Setup for SingleStore soft relations testing
	seedService = new SeedService();
	vi.clearAllMocks();
});

afterAll(async () => {
	// Cleanup
});

describe('SingleStore Soft Relations Tests', () => {
	test('handles soft one-to-many relationships', async () => {
		// In SingleStore, relationships are "soft" - managed by application logic
		// rather than database foreign key constraints
		const mockTables = [
			{
				name: 'users',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'username', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 100 } },
					{ name: 'email', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'created_at', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			},
			{
				name: 'posts',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'title', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'content', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'user_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to users.id
					{ name: 'published_at', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			}
		];

		// No foreign key relations since SingleStore doesn't support them
		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 100, seed: 123 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(2);
		}).not.toThrow();
	});

	test('handles soft many-to-many relationships through junction tables', () => {
		const mockTables = [
			{
				name: 'categories',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 100 } },
					{ name: 'description', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			},
			{
				name: 'products',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'price', columnType: 'decimal', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: { precision: 10, scale: 2 } },
				],
				primaryKeys: ['id']
			},
			{
				name: 'product_categories',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'product_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to products.id
					{ name: 'category_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to categories.id
					{ name: 'created_at', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 50, seed: 456 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(3);
		}).not.toThrow();
	});

	test('handles soft self-referencing relationships', () => {
		const table = {
			name: 'employees',
			columns: [
				{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
				{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
				{ name: 'manager_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Self-reference
				{ name: 'department', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 100 } },
			],
			primaryKeys: ['id']
		};

		// Test that self-referencing columns get appropriate generators
		const managerIdColumn = table.columns[2];
		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, managerIdColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateInt');
	});

	test('handles polymorphic relationships through type columns', () => {
		const mockTables = [
			{
				name: 'users',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
				],
				primaryKeys: ['id']
			},
			{
				name: 'companies',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
				],
				primaryKeys: ['id']
			},
			{
				name: 'addresses',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'street', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'city', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 100 } },
					{ name: 'addressable_type', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 50 } }, // 'user' or 'company'
					{ name: 'addressable_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // references users.id or companies.id
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 75, seed: 789 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(3);
		}).not.toThrow();

		// Test specific columns for polymorphic relationship
		const addressesTable = mockTables[2]!;
		const typeColumn = addressesTable.columns[3]; // addressable_type
		const idColumn = addressesTable.columns[4]; // addressable_id

		const typeGenerator = seedService.selectGeneratorForSingleStoreColumn(addressesTable as any, typeColumn as any);
		const idGenerator = seedService.selectGeneratorForSingleStoreColumn(addressesTable as any, idColumn as any);

		expect(typeGenerator).toBeDefined();
		expect(typeGenerator!.constructor.name).toBe('GenerateString');

		expect(idGenerator).toBeDefined();
		expect(idGenerator!.constructor.name).toBe('GenerateInt');
	});

	test('handles soft relationships with JSON metadata', () => {
		const mockTables = [
			{
				name: 'orders',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'customer_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
					{ name: 'total_amount', columnType: 'decimal', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: { precision: 10, scale: 2 } },
					{ name: 'metadata', columnType: 'json', dataType: 'object', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'created_at', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			},
			{
				name: 'order_items',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'order_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to orders.id
					{ name: 'product_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
					{ name: 'quantity', columnType: 'int', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'unit_price', columnType: 'decimal', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: { precision: 10, scale: 2 } },
					{ name: 'item_metadata', columnType: 'json', dataType: 'object', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 200, seed: 321 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(2);
		}).not.toThrow();

		// Test JSON metadata columns specifically
		const ordersTable = mockTables[0]!;
		const orderMetadataColumn = ordersTable.columns[3];
		
		const metadataGenerator = seedService.selectGeneratorForSingleStoreColumn(ordersTable as any, orderMetadataColumn as any);
		expect(metadataGenerator).toBeDefined();
		expect(metadataGenerator!.constructor.name).toBe('GenerateJson');
	});

	test('handles soft relationships with vector embeddings', () => {
		const mockTables = [
			{
				name: 'documents',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'title', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'content', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'author_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
					{ name: 'embedding', columnType: 'vector', dataType: 'array', primary: false, isUnique: false, notNull: false, typeParams: { dimensions: 1536 } },
					{ name: 'category_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
				],
				primaryKeys: ['id']
			},
			{
				name: 'document_similarities',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'document_a_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
					{ name: 'document_b_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference
					{ name: 'similarity_score', columnType: 'float', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'computed_at', columnType: 'timestamp', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 150, seed: 654 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(2);
		}).not.toThrow();

		// Test vector embedding column specifically
		const documentsTable = mockTables[0]!;
		const embeddingColumn = documentsTable.columns[4];
		
		const embeddingGenerator = seedService.selectGeneratorForSingleStoreColumn(documentsTable as any, embeddingColumn as any);
		expect(embeddingGenerator).toBeDefined();
		expect(embeddingGenerator!.constructor.name).toBe('GenerateArray');
		expect((embeddingGenerator! as any).params?.size).toBe(1536);
	});

	test('handles soft relationships in hierarchical data structures', () => {
		const mockTables = [
			{
				name: 'categories',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'parent_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Self-reference (soft)
					{ name: 'level', columnType: 'int', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'path', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Materialized path
				],
				primaryKeys: ['id']
			},
			{
				name: 'products',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 255 } },
					{ name: 'category_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to categories.id
					{ name: 'price', columnType: 'decimal', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: { precision: 10, scale: 2 } },
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 100, seed: 987 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(2);
		}).not.toThrow();

		// Test hierarchical parent reference
		const categoriesTable = mockTables[0]!;
		const parentColumn = categoriesTable.columns[2];
		
		const parentGenerator = seedService.selectGeneratorForSingleStoreColumn(categoriesTable as any, parentColumn as any);
		expect(parentGenerator).toBeDefined();
		expect(parentGenerator!.constructor.name).toBe('GenerateInt');
	});
});
