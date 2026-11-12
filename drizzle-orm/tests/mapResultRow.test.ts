import { expect, test } from 'vitest';
import { mapResultRow } from '../src/utils.ts';
import { Column } from '../src/column.ts';
import { Table, getTableName } from '../src/table.ts';

// Mock table and columns
class MockTable extends Table {
	override [Table.Symbol.Name] = 'mock_table';
	override [Table.Symbol.Schema] = undefined;
	override [Table.Symbol.Columns] = {};
}

class MockColumn extends Column {
	protected override $column!: any;
	constructor(table: Table, name: string) {
		super(table, { name } as any);
	}
	override getSQLType(): string {
		return 'text';
	}
	override mapFromDriverValue(value: unknown): unknown {
		return value;
	}
}

test('mapResultRow - nested partial select returns null on left join only if all columns are null', () => {
	const table1 = new MockTable();
	const table2 = new MockTable();
	table2[Table.Symbol.Name] = 'table2';
	
	const col1 = new MockColumn(table2, 'col1');
	const col2 = new MockColumn(table2, 'col2');

	const columns = [
		{ path: ['nested', 'col1'], field: col1 },
		{ path: ['nested', 'col2'], field: col2 },
	];

	// Scenario 1: First is null, second is not null
	const result1 = mapResultRow(columns, [null, 'value2'], { [getTableName(table2)]: false });
	expect(result1).toEqual({ nested: { col1: null, col2: 'value2' } });

	// Scenario 2: First is not null, second is null
	const result2 = mapResultRow(columns, ['value1', null], { [getTableName(table2)]: false });
	expect(result2).toEqual({ nested: { col1: 'value1', col2: null } });

	// Scenario 3: Both are null -> should nullify the nested object
	const result3 = mapResultRow(columns, [null, null], { [getTableName(table2)]: false });
	expect(result3).toEqual({ nested: null });
});

test('mapResultRow - nested object with mixed tables is not nullified', () => {
	const table1 = new MockTable();
	table1[Table.Symbol.Name] = 'table1';
	const table2 = new MockTable();
	table2[Table.Symbol.Name] = 'table2';
	
	const col1 = new MockColumn(table1, 'col1');
	const col2 = new MockColumn(table2, 'col2');

	const columns = [
		{ path: ['nested', 'col1'], field: col1 },
		{ path: ['nested', 'col2'], field: col2 },
	];

	// Mixed tables, all null. It should not be fully nullified based on original logic, but instead have null fields
	const result1 = mapResultRow(columns, [null, null], {
		[getTableName(table1)]: false,
		[getTableName(table2)]: false
	});
	expect(result1).toEqual({ nested: { col1: null, col2: null } });
});
