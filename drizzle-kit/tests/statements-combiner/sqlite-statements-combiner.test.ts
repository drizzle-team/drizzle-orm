import { JsonStatement } from 'src/jsonStatements';
import { SQLiteSchemaSquashed } from 'src/serializer/sqliteSchema';
import { sqliteCombineStatements } from 'src/statementCombiner';
import { expect, test } from 'vitest';

test(`renamed column and altered this column type`, async (t) => {
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
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements = [
		{
			type: 'recreate_table',
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
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
	];
	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
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
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
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
	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
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
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
				foreignKeys: {},
				compositePrimaryKeys: {
					user_id_iq_pk: 'id,iq',
				},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
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
						name: 'first_nam',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'recreate_table',
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
					name: 'first_nam',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
	];
	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

test(`drop column "ref"."name", rename column "ref"."age". dropped primary key "user"."id". Set not null to "user"."iq"`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'ref',
			oldColumnName: 'age',
			newColumnName: 'age1',
			schema: '',
		},
		{
			type: 'alter_table_alter_column_drop_pk',
			tableName: 'user',
			columnName: 'id',
			schema: '',
		},
		{
			type: 'alter_table_alter_column_drop_autoincrement',
			tableName: 'user',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_drop_notnull',
			tableName: 'user',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_set_notnull',
			tableName: 'user',
			columnName: 'iq',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_drop_column',
			tableName: 'ref',
			columnName: 'text',
			schema: '',
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: true,
					},
					user_iq: {
						name: 'user_iq',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					name: {
						name: 'name',
						type: 'text',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
					age: {
						name: 'age',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					ref_user_iq_user_iq_fk: 'ref_user_iq_user_iq_fk;ref;user_iq;user;iq;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: true,
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
					user_iq: {
						name: 'user_iq',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					age1: {
						name: 'age1',
						type: 'int',
						primaryKey: false,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					ref_user_iq_user_iq_fk: 'ref_user_iq_user_iq_fk;ref;user_iq;user;iq;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: true,
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
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'alter_table_rename_column',
			tableName: 'ref',
			oldColumnName: 'age',
			newColumnName: 'age1',
			schema: '',
		},
		{
			type: 'alter_table_drop_column',
			tableName: 'ref',
			columnName: 'text',
			schema: '',
		},
		{
			type: 'recreate_table',
			tableName: 'user',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
				{
					name: 'first_name',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'iq',
					type: 'int',
					primaryKey: false,
					notNull: true,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
	];

	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

test(`create reference on exising column (table includes unique index). expect to recreate column and recreate index`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'create_reference',
			tableName: 'unique',
			data: 'unique_ref_pk_pk_pk_fk;unique;ref_pk;pk;pk;no action;no action',
			schema: '',
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			pk: {
				name: 'pk',
				columns: {
					pk: {
						name: 'pk',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			unique: {
				name: 'unique',
				columns: {
					unique: {
						name: 'unique',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					ref_pk: {
						name: 'ref_pk',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {
					unique_unique_unique: 'unique_unique_unique;unique;true;',
				},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			pk: {
				name: 'pk',
				columns: {
					pk: {
						name: 'pk',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			unique: {
				name: 'unique',
				columns: {
					unique: {
						name: 'unique',
						type: 'text',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					ref_pk: {
						name: 'ref_pk',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {
					unique_unique_unique: 'unique_unique_unique;unique;true;',
				},
				foreignKeys: {
					unique_ref_pk_pk_pk_fk: 'unique_ref_pk_pk_pk_fk;unique;ref_pk;pk;pk;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements: JsonStatement[] = [
		{
			type: 'recreate_table',
			tableName: 'unique',
			columns: [
				{
					name: 'unique',
					type: 'text',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'ref_pk',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [
				{
					name: 'unique_ref_pk_pk_pk_fk',
					tableFrom: 'unique',
					tableTo: 'pk',
					columnsFrom: ['ref_pk'],
					columnsTo: ['pk'],
					onDelete: 'no action',
					onUpdate: 'no action',
				},
			],
			uniqueConstraints: [],
			checkConstraints: [],
		},
		{
			data: 'unique_unique_unique;unique;true;',
			internal: undefined,
			schema: '',
			tableName: 'unique',
			type: 'create_index',
		},
	];

	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

test(`add columns. set fk`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'sqlite_alter_table_add_column',
			tableName: 'ref',
			column: {
				name: 'test',
				type: 'integer',
				primaryKey: false,
				notNull: false,
				autoincrement: false,
			},
			referenceData: undefined,
		},
		{
			type: 'sqlite_alter_table_add_column',
			tableName: 'ref',
			column: {
				name: 'test1',
				type: 'integer',
				primaryKey: false,
				notNull: false,
				autoincrement: false,
			},
			referenceData: undefined,
		},
		{
			type: 'create_reference',
			tableName: 'ref',
			data: 'ref_new_age_user_new_age_fk;ref;new_age;user;new_age;no action;no action',
			schema: '',
			columnNotNull: false,
			columnDefault: undefined,
			columnType: 'integer',
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
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
					test1: {
						name: 'test1',
						type: 'integer',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					ref_new_age_user_new_age_fk: 'ref_new_age_user_new_age_fk;ref;new_age;user;new_age;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements = [
		{
			columns: [
				{
					autoincrement: false,
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'text',
				},
				{
					autoincrement: false,
					name: 'new_age',
					notNull: false,
					primaryKey: false,
					type: 'integer',
				},
				{
					autoincrement: false,
					name: 'test',
					notNull: false,
					primaryKey: false,
					type: 'integer',
				},
				{
					autoincrement: false,
					name: 'test1',
					notNull: false,
					primaryKey: false,
					type: 'integer',
				},
			],
			compositePKs: [],
			referenceData: [
				{
					columnsFrom: [
						'new_age',
					],
					columnsTo: [
						'new_age',
					],
					name: 'ref_new_age_user_new_age_fk',
					onDelete: 'no action',
					onUpdate: 'no action',
					tableFrom: 'ref',
					tableTo: 'user',
				},
			],
			tableName: 'ref',
			type: 'recreate_table',
			uniqueConstraints: [],
			checkConstraints: [],
		},
	];
	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

test(`add column and fk`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'sqlite_alter_table_add_column',
			tableName: 'ref',
			column: {
				name: 'test1',
				type: 'integer',
				primaryKey: false,
				notNull: false,
				autoincrement: false,
			},
			referenceData: 'ref_test1_user_new_age_fk;ref;test1;user;new_age;no action;no action',
		},
		{
			type: 'create_reference',
			tableName: 'ref',
			data: 'ref_test1_user_new_age_fk;ref;test1;user;new_age;no action;no action',
			schema: '',
			columnNotNull: false,
			columnDefault: undefined,
			columnType: 'integer',
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
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
					test1: {
						name: 'test1',
						type: 'integer',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					ref_test1_user_new_age_fk: 'ref_test1_user_new_age_fk;ref;test1;user;new_age;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			ref: {
				name: 'ref',
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
					test1: {
						name: 'test1',
						type: 'integer',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					ref_new_age_user_new_age_fk: 'ref_new_age_user_new_age_fk;ref;new_age;user;new_age;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			user: {
				name: 'user',
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
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements = [
		{
			type: 'sqlite_alter_table_add_column',
			tableName: 'ref',
			column: {
				name: 'test1',
				type: 'integer',
				primaryKey: false,
				notNull: false,
				autoincrement: false,
			},
			referenceData: 'ref_test1_user_new_age_fk;ref;test1;user;new_age;no action;no action',
		},
	];
	expect(sqliteCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});
