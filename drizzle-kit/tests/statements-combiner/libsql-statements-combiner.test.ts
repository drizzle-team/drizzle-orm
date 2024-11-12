import { JsonAddColumnStatement, JsonSqliteAddColumnStatement, JsonStatement } from 'src/jsonStatements';
import { SQLiteSchemaSquashed } from 'src/serializer/sqliteSchema';
import { SQLiteAlterTableAddColumnConvertor } from 'src/sqlgenerator';
import { libSQLCombineStatements } from 'src/statementCombiner';
import { expect, test } from 'vitest';

/**
 * ! before:
 *
 * user: {
 *    id INT;
 *    first_name INT;
 *    iq INT;
 *    PRIMARY KEY (id, iq)
 *    INDEXES: {
 *      UNIQUE id;
 *    }
 * }
 *
 * ! after:
 *
 *  new_user: {
 *    id INT;
 *    first_name INT;
 *    iq INT;
 *    PRIMARY KEY (id, iq)
 *    INDEXES: {}
 * }
 *
 * rename table and drop unique index
 * expect to get "rename_table" statement and then "recreate_table"
 */
test(`rename table and drop index`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'rename_table',
			fromSchema: '',
			toSchema: '',
			tableNameFrom: 'user',
			tableNameTo: 'new_user',
		},
		{
			type: 'drop_index',
			tableName: 'new_user',
			data: 'user_first_name_unique;first_name;true;',
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
					first_name: {
						name: 'first_name',
						type: 'int',
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
				indexes: {
					user_first_name_unique: 'user_first_name_unique;first_name;true;',
				},
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
			new_user: {
				name: 'new_user',
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
						type: 'int',
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
				compositePrimaryKeys: {
					new_user_id_iq_pk: 'id,iq',
				},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		enums: {},
		views: {},
	};

	const newJsonStatements = [
		{
			type: 'rename_table',
			fromSchema: '',
			toSchema: '',
			tableNameFrom: 'user',
			tableNameTo: 'new_user',
		},
		{
			type: 'drop_index',
			tableName: 'new_user',
			data: 'user_first_name_unique;first_name;true;',
			schema: '',
		},
	];
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

/**
 * ! before:
 *
 * autoincrement1: {
 *    id INT PRIMARY KEY;
 * }
 *
 * autoincrement2: {
 *    id INT PRIMARY KEY AUTOINCREMENT;
 * }
 *
 * dropNotNull: {
 *    id INT NOT NULL;
 * }
 *
 * ! after:
 *
 * autoincrement1: {
 *    id INT PRIMARY KEY AUTOINCREMENT;
 * }
 *
 * autoincrement2: {
 *    id INT PRI<ARY KEY;
 * }
 *
 * dropNotNull: {
 *    id INT;
 * }
 *
 * drop autoincrement for autoincrement1
 * set autoincrement for autoincrement2
 *
 * expect to:
 * - get "recreate_table" for autoincrement1
 * - get "recreate_table" for autoincrement2
 * - get "drop_notnull" for dropNotNull
 */
test(`drop, set autoincrement. drop not null`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_set_autoincrement',
			tableName: 'autoincrement1',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: true,
			columnPk: true,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_drop_autoincrement',
			tableName: 'autoincrement2',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: false,
			columnPk: true,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_drop_notnull',
			tableName: 'dropNotNull',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			autoincrement1: {
				name: 'autoincrement1',
				columns: {
					id: {
						name: 'id',
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
			autoincrement2: {
				name: 'autoincrement2',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: false,
						autoincrement: true,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			dropNotNull: {
				name: 'dropNotNull',
				columns: {
					id: {
						name: 'id',
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
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			autoincrement1: {
				name: 'autoincrement1',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: true,
						notNull: true,
						autoincrement: true,
					},
				},
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			autoincrement2: {
				name: 'autoincrement2',
				columns: {
					id: {
						name: 'id',
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
			dropNotNull: {
				name: 'dropNotNull',
				columns: {
					id: {
						name: 'id',
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
			tableName: 'autoincrement1',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: true,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
		{
			type: 'recreate_table',
			tableName: 'autoincrement2',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
		{
			type: 'alter_table_alter_column_drop_notnull',
			tableName: 'dropNotNull',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		},
	];
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

/**
 * ! before:
 *
 * pk1: {
 *    id INT;
 * }
 *
 * pk2: {
 *    id INT PRIMARY KEY;
 * }
 *
 * ref_table: {
 *    id INT;
 * }
 *
 * create_reference: {
 *    id INT;
 * }
 *
 * ! after:
 *
 * pk1: {
 *    id INT PRIMARY KEY;
 * }
 *
 * pk2: {
 *    id INT;
 * }
 *
 * ref_table: {
 *    id INT;
 * }
 *
 * create_reference: {
 *    id INT -> ref_table INT;
 * }
 *
 * drop primary key for pk2
 * set primary key for pk1
 * "create_reference" reference on "ref_table"
 *
 * expect to:
 * - "recreate_table" statement for pk1
 * - "recreate_table" statement for pk2
 * - "create_reference" statement for create_reference
 */
test(`drop and set primary key. create reference`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_set_pk',
			tableName: 'pk1',
			schema: '',
			columnName: 'id',
		},
		{
			type: 'alter_table_alter_column_set_notnull',
			tableName: 'pk1',
			columnName: 'id',
			schema: '',
			newDataType: 'int',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: false,
			columnPk: true,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_drop_pk',
			tableName: 'pk2',
			columnName: 'id',
			schema: '',
		},
		{
			type: 'alter_table_alter_column_drop_notnull',
			tableName: 'pk2',
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
			type: 'create_reference',
			tableName: 'create_reference',
			data: 'create_reference_id_ref_table_id_fk;create_reference;id;ref_table;id;no action;no action',
			schema: '',
			columnNotNull: false,
			columnDefault: undefined,
			columnType: 'int',
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			create_reference: {
				name: 'create_reference',
				columns: {
					id: {
						name: 'id',
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
			pk1: {
				name: 'pk1',
				columns: {
					id: {
						name: 'id',
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
			pk2: {
				name: 'pk2',
				columns: {
					id: {
						name: 'id',
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
			ref_table: {
				name: 'ref_table',
				columns: {
					id: {
						name: 'id',
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
		},
		enums: {},
		views: {},
	};
	const json2: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			create_reference: {
				name: 'create_reference',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					create_reference_id_ref_table_id_fk:
						'create_reference_id_ref_table_id_fk;create_reference;id;ref_table;id;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			pk1: {
				name: 'pk1',
				columns: {
					id: {
						name: 'id',
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
			pk2: {
				name: 'pk2',
				columns: {
					id: {
						name: 'id',
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
			ref_table: {
				name: 'ref_table',
				columns: {
					id: {
						name: 'id',
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
		},
		enums: {},
		views: {},
	};

	const newJsonStatements = [
		{
			type: 'recreate_table',
			tableName: 'pk1',
			columns: [
				{
					name: 'id',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
		{
			type: 'recreate_table',
			tableName: 'pk2',
			columns: [
				{
					name: 'id',
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
		{
			type: 'create_reference',
			tableName: 'create_reference',
			data: 'create_reference_id_ref_table_id_fk;create_reference;id;ref_table;id;no action;no action',
			schema: '',
			columnNotNull: false,
			columnDefault: undefined,
			columnType: 'int',
		},
	];
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

/**
 * ! before:
 *
 * fk1: {
 *  fk_id INT;
 *  fk_id1 INT;
 * }
 *
 * fk2: {
 *  fk2_id INT;  -> composite reference on ref_table id INT
 *  fk2_id1 INT; -> composite reference on ref_table id1 INT
 * }
 *
 * ref_table: {
 *  id INT;
 *  id1 INT;
 * }
 *
 * ! after:
 *
 * fk1: {
 *  fk_id INT;  -> composite reference on ref_table id INT
 *  fk_id1 INT; -> composite reference on ref_table id1 INT
 * }
 *
 * fk2: {
 *  fk2_id INT;
 *  fk2_id1 INT;
 * }
 *
 * ref_table: {
 *  id INT;
 *  id1 INT;
 * }
 *
 * set multi column reference for fk1
 * drop multi column reference for fk2
 *
 * expect to:
 * - "recreate_table" statement for fk1
 * - "recreate_table" statement for fk2
 */
test(`set and drop multiple columns reference`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'delete_reference',
			tableName: 'fk1',
			data: 'fk1_fk_id_fk_id1_ref_table_id_id1_fk;fk1;fk_id,fk_id1;ref_table;id,id1;no action;no action',
			schema: '',
			isMulticolumn: true,
		},
		{
			type: 'create_reference',
			tableName: 'fk2',
			data: 'fk2_fk2_id_fk2_id1_ref_table_id_id1_fk;fk2;fk2_id,fk2_id1;ref_table;id,id1;no action;no action',
			schema: '',
			isMulticolumn: true,
		},
	];
	const json1: SQLiteSchemaSquashed = {
		version: '6',
		dialect: 'sqlite',
		tables: {
			fk1: {
				name: 'fk1',
				columns: {
					fk_id: {
						name: 'fk_id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					fk_id1: {
						name: 'fk_id1',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					fk1_fk_id_fk_id1_ref_table_id_id1_fk:
						'fk1_fk_id_fk_id1_ref_table_id_id1_fk;fk1;fk_id,fk_id1;ref_table;id,id1;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			fk2: {
				name: 'fk2',
				columns: {
					fk2_id: {
						name: 'fk2_id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					fk2_id1: {
						name: 'fk2_id1',
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
			ref_table: {
				name: 'ref_table',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					id1: {
						name: 'id1',
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
			fk1: {
				name: 'fk1',
				columns: {
					fk_id: {
						name: 'fk_id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					fk_id1: {
						name: 'fk_id1',
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
			fk2: {
				name: 'fk2',
				columns: {
					fk2_id: {
						name: 'fk2_id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					fk2_id1: {
						name: 'fk2_id1',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
				},
				indexes: {},
				foreignKeys: {
					fk2_fk2_id_fk2_id1_ref_table_id_id1_fk:
						'fk2_fk2_id_fk2_id1_ref_table_id_id1_fk;fk2;fk2_id,fk2_id1;ref_table;id,id1;no action;no action',
				},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
			ref_table: {
				name: 'ref_table',
				columns: {
					id: {
						name: 'id',
						type: 'int',
						primaryKey: false,
						notNull: false,
						autoincrement: false,
					},
					id1: {
						name: 'id1',
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
			tableName: 'fk1',
			columns: [
				{
					name: 'fk_id',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'fk_id1',
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
		{
			type: 'recreate_table',
			tableName: 'fk2',
			columns: [
				{
					name: 'fk2_id',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
				{
					name: 'fk2_id1',
					type: 'int',
					primaryKey: false,
					notNull: false,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [
				{
					name: 'fk2_fk2_id_fk2_id1_ref_table_id_id1_fk',
					tableFrom: 'fk2',
					tableTo: 'ref_table',
					columnsFrom: ['fk2_id', 'fk2_id1'],
					columnsTo: ['id', 'id1'],
					onDelete: 'no action',
					onUpdate: 'no action',
				},
			],
			uniqueConstraints: [],
			checkConstraints: [],
		},
	];
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});

/**
 * ! before:
 *
 * pk: {
 *  pk TEXT PRIMARY KEY;
 * }
 *
 * simple: {
 *  simple TEXT;
 * }
 *
 * unique: {
 *  unique INT UNIQUE;
 * }
 *
 * ! after:
 *
 * pk: {
 *  pk INT PRIMARY KEY;
 * }
 *
 * simple: {
 *  simple INT;
 * }
 *
 * unique: {
 *  unique TEXT UNIQUE;
 * }
 *
 * set new type for primary key column
 * set new type for unique column
 * set new type for column without pk or unique
 *
 * expect to:
 * - "recreate_table" statement for pk
 * - "recreate_table" statement for unique
 * - "alter_table_alter_column_set_type" statement for simple
 * - "create_index" statement for unique
 */
test(`set new type for primary key, unique and normal column`, async (t) => {
	const statements: JsonStatement[] = [
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'pk',
			columnName: 'pk',
			newDataType: 'int',
			oldDataType: 'text',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: true,
			columnAutoIncrement: false,
			columnPk: true,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'simple',
			columnName: 'simple',
			newDataType: 'int',
			oldDataType: 'text',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'unique',
			columnName: 'unique',
			newDataType: 'text',
			oldDataType: 'int',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		} as unknown as JsonStatement,
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
						type: 'text',
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
			simple: {
				name: 'simple',
				columns: {
					simple: {
						name: 'simple',
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
			unique: {
				name: 'unique',
				columns: {
					unique: {
						name: 'unique',
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
			simple: {
				name: 'simple',
				columns: {
					simple: {
						name: 'simple',
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

	const newJsonStatements = [
		{
			type: 'recreate_table',
			tableName: 'pk',
			columns: [
				{
					name: 'pk',
					type: 'int',
					primaryKey: true,
					notNull: true,
					autoincrement: false,
				},
			],
			compositePKs: [],
			referenceData: [],
			uniqueConstraints: [],
			checkConstraints: [],
		},
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'simple',
			columnName: 'simple',
			newDataType: 'int',
			oldDataType: 'text',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		},
		{
			type: 'alter_table_alter_column_set_type',
			tableName: 'unique',
			columnName: 'unique',
			newDataType: 'text',
			oldDataType: 'int',
			schema: '',
			columnDefault: undefined,
			columnOnUpdate: undefined,
			columnNotNull: false,
			columnAutoIncrement: false,
			columnPk: false,
		},
	];
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
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
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
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
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
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
	expect(libSQLCombineStatements(statements, json2)).toStrictEqual(
		newJsonStatements,
	);
});
