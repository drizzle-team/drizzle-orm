// SingleStore Cyclic Tables Test
// Tests scenarios with circular references adapted for SingleStore (no foreign keys)

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
	// Setup for SingleStore cyclic tables testing
	seedService = new SeedService();
	vi.clearAllMocks();
});

afterAll(async () => {
	// Cleanup
});

describe('SingleStore Cyclic Tables Tests', () => {
	test('handles tables with potential circular references (soft relations)', async () => {
		// Mock successful database operations
		mockDb.select.mockReturnThis();
		mockDb.from.mockReturnValue(Promise.resolve(Array.from({ length: 100 }, () => ({}))));

		// Since SingleStore doesn't support foreign keys, we simulate
		// soft relations through column references
		const mockTables = [
			{
				name: 'department',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'manager_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to employee
				],
				primaryKeys: ['id']
			},
			{
				name: 'employee',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'department_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to department
					{ name: 'supervisor_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Self-reference
				],
				primaryKeys: ['id']
			},
			{
				name: 'project',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'lead_employee_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to employee
				],
				primaryKeys: ['id']
			},
			{
				name: 'employee_project',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'employee_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to employee
					{ name: 'project_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} }, // Soft reference to project
					{ name: 'role', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 100 } },
				],
				primaryKeys: ['id']
			}
		];

		// No actual foreign key relations since SingleStore doesn't support them
		const mockRelations: any[] = [];

		// Test that the generator can handle potentially cyclic table structures
		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				mockTables as any,
				mockRelations,
				undefined,
				{ count: 100, seed: 123 }
			);

			// Verify generators were created
			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(4); // One for each table
		}).not.toThrow();
	});

	test('handles self-referencing table structure', () => {
		const table = {
			name: 'employee',
			columns: [
				{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
				{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
				{ name: 'supervisor_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
			],
			primaryKeys: ['id']
		};

		// Test that self-referencing columns get appropriate generators
		const supervisorColumn = table.columns[2];
		const generator = seedService.selectGeneratorForSingleStoreColumn(table as any, supervisorColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateInt');
	});

	test('handles many-to-many relationship table (junction table)', () => {
		const junctionTable = {
			name: 'employee_project',
			columns: [
				{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
				{ name: 'employee_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'project_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'start_date', columnType: 'date', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'end_date', columnType: 'date', dataType: 'date', primary: false, isUnique: false, notNull: false, typeParams: {} },
			],
			primaryKeys: ['id']
		};

		// Test that junction table columns get appropriate generators
		const employeeIdColumn = junctionTable.columns[1];
		const projectIdColumn = junctionTable.columns[2];
		
		const employeeIdGenerator = seedService.selectGeneratorForSingleStoreColumn(junctionTable as any, employeeIdColumn as any);
		const projectIdGenerator = seedService.selectGeneratorForSingleStoreColumn(junctionTable as any, projectIdColumn as any);
		
		expect(employeeIdGenerator).toBeDefined();
		expect(employeeIdGenerator!.constructor.name).toBe('GenerateInt');
		
		expect(projectIdGenerator).toBeDefined();
		expect(projectIdGenerator!.constructor.name).toBe('GenerateInt');
	});

	test('handles complex organizational structure', () => {
		// Test a complex organizational structure with multiple potential cycles
		const complexTables = [
			{
				name: 'company',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'ceo_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			},
			{
				name: 'department',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'company_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'manager_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'parent_department_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			},
			{
				name: 'employee',
				columns: [
					{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
					{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
					{ name: 'department_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
					{ name: 'manager_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				],
				primaryKeys: ['id']
			}
		];

		const mockRelations: any[] = [];

		expect(() => {
			const generators = seedService.generatePossibleGenerators(
				'singlestore',
				complexTables as any,
				mockRelations,
				undefined,
				{ count: 50, seed: 456 }
			);

			expect(generators).toBeDefined();
			expect(Array.isArray(generators)).toBe(true);
			expect(generators.length).toBe(3);
		}).not.toThrow();
	});

	test('handles tree-like hierarchy (parent-child relationships)', () => {
		const hierarchyTable = {
			name: 'category',
			columns: [
				{ name: 'id', columnType: 'bigint', dataType: 'bigint', primary: true, isUnique: false, notNull: true, typeParams: {} },
				{ name: 'name', columnType: 'varchar', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: { length: 256 } },
				{ name: 'parent_category_id', columnType: 'bigint', dataType: 'bigint', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'level', columnType: 'int', dataType: 'number', primary: false, isUnique: false, notNull: false, typeParams: {} },
				{ name: 'path', columnType: 'text', dataType: 'string', primary: false, isUnique: false, notNull: false, typeParams: {} },
			],
			primaryKeys: ['id']
		};

		// Test parent reference column
		const parentColumn = hierarchyTable.columns[2];
		const generator = seedService.selectGeneratorForSingleStoreColumn(hierarchyTable as any, parentColumn as any);
		
		expect(generator).toBeDefined();
		expect(generator!.constructor.name).toBe('GenerateInt');
	});
});
