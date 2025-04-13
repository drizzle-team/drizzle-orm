import { Named } from 'src/cli/commands/migrate';
import { mapEntries, mapKeys } from 'src/global';
import { JsonStatement } from 'src/jsonStatements';
import { Column, SingleStoreSchemaSquashed } from 'src/serializer/singlestoreSchema';
import { singleStoreCombineStatements } from 'src/statementCombiner';
import { copy } from 'src/utils';
import { expect, test } from 'vitest';

test(`change column data type`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'user',
			oldColumnName: 'lastName',
			newColumnName: 'lastName123',
			schema: '',
		},
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'user',
			columnName: 'lastName123',
			newDataType: 'int',
			oldDataType: 'text',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
			columnIsUnique: false,
		} as unknown as JsonStatement,
	];
	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					firstName: {
						name: 'firstName',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
					lastName: {
						name: 'lastName',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					test: {
						name: 'test',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					firstName: {
						name: 'firstName',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
					lastName123: {
						name: 'lastName123',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					test: {
						name: 'test',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};

	const columnRenames = [] as {
		table: string;
		renames: { from: Column; to: Column }[];
	}[];
	columnRenames.push({
		table: 'user',
		renames: [{
			from: json1.tables['user'].columns['lastName'],
			to: json2.tables['user'].columns['lastName123'],
		}],
	});
	const columnRenamesDict = columnRenames.reduce(
		(acc, it) => {
			acc[it.table] = it.renames;
			return acc;
		},
		{} as Record<
			string,
			{
				from: Named;
				to: Named;
			}[]
		>,
	);
	const columnChangeFor = (
		column: string,
		renamedColumns: { from: Named; to: Named }[],
	) => {
		for (let ren of renamedColumns) {
			if (column === ren.from.name) {
				return ren.to.name;
			}
		}

		return column;
	};

	const columnsPatchedSnap1 = copy(json1);
	columnsPatchedSnap1.tables = mapEntries(
		columnsPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapKeys(
				tableValue.columns,
				(columnKey, column) => {
					const rens = columnRenamesDict[tableValue.name] || [];
					const newName = columnChangeFor(columnKey, rens);
					column.name = newName;
					return newName;
				},
			);

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'user',
			oldColumnName: 'lastName',
			newColumnName: 'lastName123',
			schema: '',
		},
		{
			type: 'singlestore_recreate_table',
			tableName: 'user',
			columns: [
				{
					name: 'firstName',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'lastName123',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'test',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['firstName', 'lastName123', 'test'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, columnsPatchedSnap1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`set autoincrement`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_set_autoincrement',
			tableName: 'users',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: true,
			columnPk: false,
		} as unknown as JsonStatement,
	];
	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: true,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const newJsonStatements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: 'users',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: true,
				},
				{
					name: 'name',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'email',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id', 'name', 'email'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`drop autoincrement`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_drop_autoincrement',
			tableName: 'users',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: true,
			columnPk: false,
		} as unknown as JsonStatement,
	];

	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: true,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const newJsonStatements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: 'users',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'name',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'email',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id', 'name', 'email'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`set not null`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_set_notnull',
			tableName: 'users',
			columnName: 'name',
			schema: '',
			newDataType: 'text',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
	];

	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const newJsonStatements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: 'users',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'name',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'email',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id', 'name', 'email'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`drop not null`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_drop_notnull',
			tableName: 'users',
			columnName: 'name',
			schema: '',
			newDataType: 'text',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
	];

	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					email: {
						name: 'email',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const newJsonStatements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: 'users',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'name',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'email',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id', 'name', 'email'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`renamed column and droped column "test"`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'user',
			oldColumnName: 'lastName',
			newColumnName: 'lastName123',
			schema: '',
		},
		{
			type: 'alter_table_drop_column',
			tableName: 'user',
			columnName: 'test',
			schema: '',
		},
	];
	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					firstName: {
						name: 'firstName',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
					lastName: {
						name: 'lastName',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					test: {
						name: 'test',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					firstName: {
						name: 'firstName',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
					lastName123: {
						name: 'lastName123',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					test: {
						name: 'test',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'user',
			oldColumnName: 'lastName',
			newColumnName: 'lastName123',
			schema: '',
		},
		{
			type: 'alter_table_drop_column',
			tableName: 'user',
			columnName: 'test',
			schema: '',
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`droped column that is part of composite pk`, async (t) => {
	const statements: JsonStatement[] = [
		{ type: 'delete_composite_pk', tableName: 'user', data: 'id,iq' },
		{
			type: 'alter_table_alter_column_set_pk',
			tableName: 'user',
			schema: '',
			columnName: 'id',
		},
		{
			type: 'alter_table_drop_column',
			tableName: 'user',
			columnName: 'iq',
			schema: '',
		},
	];
	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					first_name: {
						name: 'first_name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					iq: {
						name: 'iq',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {
					user_id_iq_pk: 'id,iq',
				},
				uniqueConstraints: {},
			},
		},
	};
	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			user: {
				name: 'user',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: false,
						autoincrement: false,
					},
					first_name: {
						name: 'first_name',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'singlestore_recreate_table',
			tableName: 'user',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'first_name',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id', 'first_name'],
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});

test(`add column with pk`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_add_column',
			tableName: 'table',
			column: {
				name: 'test',
				type: 'integer',
				primaryKey: true,
				notNull: false,
				autoincrement: false,
			},
			schema: '',
		},
	];
	const json1: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			table: {
				name: 'table',
				columns: {
					id1: {
						name: 'id1',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					new_age: {
						name: 'new_age',
						type: 'integer',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			table: {
				name: 'table',
				columns: {
					id1: {
						name: 'id1',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					new_age: {
						name: 'new_age',
						type: 'integer',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					test: {
						name: 'test',
						type: 'integer',
						primaryKey: true,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
			},
		},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			columns: [
				{
					name: 'id1',
					type: 'text',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'new_age',
					type: 'integer',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'test',
					type: 'integer',
					primaryKey: true,
					notNull: false,
					autoincrement: false,
				},
			],
			columnsToTransfer: ['id1', 'new_age'],
			compositePKs: [],
			tableName: 'table',
			type: 'singlestore_recreate_table',
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2, json1)).toStrictEqual(
		newJsonStatements,
	);
});
