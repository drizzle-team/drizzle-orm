import { JsonStatement } from 'src/jsonStatements';
import { SingleStoreSchemaSquashed } from 'src/serializer/singlestoreSchema';
import { singleStoreCombineStatements } from 'src/statementCombiner';
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
					lastName: {
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

	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					new_id: {
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
	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					new_id: {
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
	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					new_id: {
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
	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					new_id: {
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
	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const json2: SingleStoreSchemaSquashed = {
		version: '1',
		dialect: 'singlestore',
		tables: {
			users: {
				name: 'users',
				columns: {
					new_id: {
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
	const newJsonStatements = [
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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
					lastName: {
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
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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
					first_nam: {
						name: 'first_nam',
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
					first_nam: {
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
			compositePKs: [],
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
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

	const newJsonStatements = [
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
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			compositePKs: [],
			tableName: 'table',
			type: 'singlestore_recreate_table',
			uniqueConstraints: [],
		},
	];
	expect(singleStoreCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});
