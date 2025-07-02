// SingleStore Generators Test
// Tests specific generator functionality for SingleStore columns

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
	// Setup for SingleStore generators testing
	seedService = new SeedService();
	vi.clearAllMocks();
});

afterAll(async () => {
	// Cleanup
});

describe('SingleStore Generators Tests', () => {
	test('vector generator produces valid embeddings', () => {
		const table = { name: 'embeddings_table', columns: [], primaryKeys: ['id'] };

		// Test vector column with 1536 dimensions (standard OpenAI embedding size)
		const vectorColumn = {
			name: 'embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { dimensions: 1536 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, vectorColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateArray');
		
		// Check that the generator has the correct size parameter
		const params = (generator! as any).params;
		expect(params).toBeDefined();
		expect(params.size).toBe(1536);
	});

	test('vector generator with custom dimensions', () => {
		const table = { name: 'embeddings_table', columns: [], primaryKeys: ['id'] };

		// Test vector column with custom dimensions
		const customVectorColumn = {
			name: 'custom_embedding',
			columnType: 'vector',
			dataType: 'array',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { dimensions: 768 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, customVectorColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateArray');
		expect((generator! as any).params?.size).toBe(768);
	});

	test('enum generator with SingleStore enum values', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		const enumColumn = {
			name: 'status',
			columnType: 'enum',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { values: ['active', 'inactive', 'pending', 'suspended'] }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, enumColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateValuesFromArray');
		expect((generator! as any).params?.values).toEqual(['active', 'inactive', 'pending', 'suspended']);
	});

	test('JSON generator for complex data structures', () => {
		const table = { name: 'documents_table', columns: [], primaryKeys: ['id'] };

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

	test('bigint generators for large integer values', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		// Test bigint with number data type
		const bigintNumberColumn = {
			name: 'large_number',
			columnType: 'bigint',
			dataType: 'number',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator1 = seedService.selectGeneratorForSingleStoreColumn(table as any, bigintNumberColumn as any);
		expect(generator1).toBeDefined();
		expect(generator1!.constructor.name).toBe('GenerateInt');

		// Test bigint with bigint data type
		const bigintColumn = {
			name: 'id_reference',
			columnType: 'bigint',
			dataType: 'bigint',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator2 = seedService.selectGeneratorForSingleStoreColumn(table as any, bigintColumn as any);
		expect(generator2).toBeDefined();
		expect(generator2!.constructor.name).toBe('GenerateInt');
	});

	test('serial primary key generator for auto-increment', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		const serialColumn = {
			name: 'id',
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

	test('timestamp generators with different modes', () => {
		const table = { name: 'events_table', columns: [], primaryKeys: ['id'] };

		// Test timestamp with date mode
		const timestampDateColumn = {
			name: 'created_at',
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
			name: 'updated_at',
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

	test('varchar generators with length constraints', () => {
		const table = { name: 'test_table', columns: [], primaryKeys: ['id'] };

		const varcharColumn = {
			name: 'description',
			columnType: 'varchar',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { length: 500 }
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, varcharColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateString');
	});

	test('text generators for large text content', () => {
		const table = { name: 'articles_table', columns: [], primaryKeys: ['id'] };

		const textColumn = {
			name: 'content',
			columnType: 'text',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, textColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateText');
	});

	test('boolean generators for true/false values', () => {
		const table = { name: 'settings_table', columns: [], primaryKeys: ['id'] };

		const booleanColumn = {
			name: 'is_enabled',
			columnType: 'boolean',
			dataType: 'boolean',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, booleanColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateBoolean');
	});

	test('date generators with different modes', () => {
		const table = { name: 'events_table', columns: [], primaryKeys: ['id'] };

		// Test date with date mode
		const dateColumn = {
			name: 'event_date',
			columnType: 'date',
			dataType: 'date',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator1 = seedService.selectGeneratorForSingleStoreColumn(table as any, dateColumn as any);
		expect(generator1).toBeDefined();
		expect(generator1!.constructor.name).toBe('GenerateDate');

		// Test date with string mode
		const dateStringColumn = {
			name: 'event_date_str',
			columnType: 'date',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: {}
		};

		const generator2 = seedService.selectGeneratorForSingleStoreColumn(table as any, dateStringColumn as any);
		expect(generator2).toBeDefined();
		expect(generator2!.constructor.name).toBe('GenerateDate');
	});

	test('numeric type generators with proper ranges', () => {
		const table = { name: 'measurements_table', columns: [], primaryKeys: ['id'] };

		// Test different numeric types
		const numericTypes = [
			{ name: 'int_value', columnType: 'int', dataType: 'number' },
			{ name: 'tinyint_value', columnType: 'tinyint', dataType: 'number' },
			{ name: 'smallint_value', columnType: 'smallint', dataType: 'number' },
			{ name: 'mediumint_value', columnType: 'mediumint', dataType: 'number' },
			{ name: 'float_value', columnType: 'float', dataType: 'number' },
			{ name: 'double_value', columnType: 'double', dataType: 'number' },
			{ name: 'decimal_value', columnType: 'decimal', dataType: 'number' },
			{ name: 'real_value', columnType: 'real', dataType: 'number' },
		];

		for (const type of numericTypes) {
			const column = {
				name: type.name,
				columnType: type.columnType,
				dataType: type.dataType,
				primary: false,
				isUnique: false,
				notNull: false,
				typeParams: {}
			};

			const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, column as any);
			expect(generator).toBeDefined();
			
			if (type.columnType.includes('float') || type.columnType.includes('double') || 
				type.columnType.includes('decimal') || type.columnType.includes('real')) {
				expect(generator!.constructor.name).toBe('GenerateNumber');
			} else {
				expect(generator!.constructor.name).toBe('GenerateInt');
			}
		}
	});

	test('binary data generators', () => {
		const table = { name: 'files_table', columns: [], primaryKeys: ['id'] };

		// Test binary column
		const binaryColumn = {
			name: 'file_data',
			columnType: 'binary',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { length: 255 }
		};

		const generator1 = seedService.selectGeneratorForSingleStoreColumn(table as any, binaryColumn as any);
		expect(generator1).toBeDefined();
		expect(generator1!.constructor.name).toBe('GenerateString');

		// Test varbinary column
		const varbinaryColumn = {
			name: 'variable_data',
			columnType: 'varbinary',
			dataType: 'string',
			primary: false,
			isUnique: false,
			notNull: false,
			typeParams: { length: 512 }
		};

		const generator2 = seedService.selectGeneratorForSingleStoreColumn(table as any, varbinaryColumn as any);
		expect(generator2).toBeDefined();
		expect(generator2!.constructor.name).toBe('GenerateString');
	});
});
