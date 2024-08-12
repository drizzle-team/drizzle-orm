import chalk from 'chalk';
import { table } from 'console';
import { warning } from './cli/views';
import { CommonSquashedSchema, Dialect } from './schemaValidator';
import { MySqlKitInternals, MySqlSchema, MySqlSquasher } from './serializer/mysqlSchema';
import { Index, PgSchema, PgSquasher } from './serializer/pgSchema';
import { SQLiteKitInternals, SQLiteSquasher } from './serializer/sqliteSchema';
import { AlteredColumn, Column, Sequence, Table } from './snapshotsDiffer';

export interface JsonSqliteCreateTableStatement {
	type: 'sqlite_create_table';
	tableName: string;
	columns: Column[];
	referenceData: {
		name: string;
		tableFrom: string;
		columnsFrom: string[];
		tableTo: string;
		columnsTo: string[];
		onUpdate?: string | undefined;
		onDelete?: string | undefined;
	}[];
	compositePKs: string[][];
	uniqueConstraints?: string[];
}

export interface JsonCreateTableStatement {
	type: 'create_table';
	tableName: string;
	schema: string;
	columns: Column[];
	compositePKs: string[];
	compositePkName?: string;
	uniqueConstraints?: string[];
	internals?: MySqlKitInternals;
}

export interface JsonDropTableStatement {
	type: 'drop_table';
	tableName: string;
	schema: string;
}

export interface JsonRenameTableStatement {
	type: 'rename_table';
	fromSchema: string;
	toSchema: string;
	tableNameFrom: string;
	tableNameTo: string;
}

export interface JsonCreateEnumStatement {
	type: 'create_type_enum';
	name: string;
	schema: string;
	values: string[];
}

export interface JsonDropEnumStatement {
	type: 'drop_type_enum';
	name: string;
	schema: string;
}

export interface JsonMoveEnumStatement {
	type: 'move_type_enum';
	name: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonRenameEnumStatement {
	type: 'rename_type_enum';
	nameFrom: string;
	nameTo: string;
	schema: string;
}

export interface JsonAddValueToEnumStatement {
	type: 'alter_type_add_value';
	name: string;
	schema: string;
	value: string;
	before: string;
}

export interface JsonCreateSequenceStatement {
	type: 'create_sequence';
	name: string;
	schema: string;
	values: {
		increment?: string | undefined;
		minValue?: string | undefined;
		maxValue?: string | undefined;
		startWith?: string | undefined;
		cache?: string | undefined;
		cycle?: boolean | undefined;
	};
}

export interface JsonDropSequenceStatement {
	type: 'drop_sequence';
	name: string;
	schema: string;
}

export interface JsonMoveSequenceStatement {
	type: 'move_sequence';
	name: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonRenameSequenceStatement {
	type: 'rename_sequence';
	nameFrom: string;
	nameTo: string;
	schema: string;
}

export interface JsonAlterSequenceStatement {
	type: 'alter_sequence';
	name: string;
	schema: string;
	values: {
		increment?: string | undefined;
		minValue?: string | undefined;
		maxValue?: string | undefined;
		startWith?: string | undefined;
		cache?: string | undefined;
		cycle?: boolean | undefined;
	};
}

export interface JsonDropColumnStatement {
	type: 'alter_table_drop_column';
	tableName: string;
	columnName: string;
	schema: string;
}

export interface JsonAddColumnStatement {
	type: 'alter_table_add_column';
	tableName: string;
	column: Column;
	schema: string;
}

export interface JsonSqliteAddColumnStatement {
	type: 'sqlite_alter_table_add_column';
	tableName: string;
	column: Column;
	referenceData?: string;
}

export interface JsonCreateIndexStatement {
	type: 'create_index';
	tableName: string;
	data: string;
	schema: string;
	internal?: MySqlKitInternals | SQLiteKitInternals;
}

export interface JsonPgCreateIndexStatement {
	type: 'create_index_pg';
	tableName: string;
	data: Index;
	schema: string;
}

export interface JsonReferenceStatement {
	type: 'create_reference' | 'alter_reference' | 'delete_reference';
	data: string;
	schema: string;
	tableName: string;
	//   fromTable: string;
	//   fromColumns: string[];
	//   toTable: string;
	//   toColumns: string[];
	//   foreignKeyName: string;
	//   onDelete?: string;
	//   onUpdate?: string;
}

export interface JsonCreateUniqueConstraint {
	type: 'create_unique_constraint';
	tableName: string;
	data: string;
	schema?: string;
	constraintName?: string;
}

export interface JsonDeleteUniqueConstraint {
	type: 'delete_unique_constraint';
	tableName: string;
	data: string;
	schema?: string;
	constraintName?: string;
}

export interface JsonAlterUniqueConstraint {
	type: 'alter_unique_constraint';
	tableName: string;
	old: string;
	new: string;
	schema?: string;
	oldConstraintName?: string;
	newConstraintName?: string;
}

export interface JsonCreateCompositePK {
	type: 'create_composite_pk';
	tableName: string;
	data: string;
	schema?: string;
	constraintName?: string;
}

export interface JsonDeleteCompositePK {
	type: 'delete_composite_pk';
	tableName: string;
	data: string;
	schema?: string;
	constraintName?: string;
}

export interface JsonAlterCompositePK {
	type: 'alter_composite_pk';
	tableName: string;
	old: string;
	new: string;
	schema?: string;
	oldConstraintName?: string;
	newConstraintName?: string;
}

export interface JsonAlterTableSetSchema {
	type: 'alter_table_set_schema';
	tableName: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonAlterTableRemoveFromSchema {
	type: 'alter_table_remove_from_schema';
	tableName: string;
	schema: string;
}

export interface JsonAlterTableSetNewSchema {
	type: 'alter_table_set_new_schema';
	tableName: string;
	from: string;
	to: string;
}

export interface JsonCreateReferenceStatement extends JsonReferenceStatement {
	type: 'create_reference';
}

export interface JsonAlterReferenceStatement extends JsonReferenceStatement {
	type: 'alter_reference';
	oldFkey: string;
}

export interface JsonDeleteReferenceStatement extends JsonReferenceStatement {
	type: 'delete_reference';
}

export interface JsonDropIndexStatement {
	type: 'drop_index';
	tableName: string;
	data: string;
	schema: string;
}

export interface JsonRenameColumnStatement {
	type: 'alter_table_rename_column';
	tableName: string;
	oldColumnName: string;
	newColumnName: string;
	schema: string;
}

export interface JsonAlterColumnTypeStatement {
	type: 'alter_table_alter_column_set_type';
	tableName: string;
	columnName: string;
	newDataType: string;
	oldDataType: string;
	schema: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
	columnGenerated?: { as: string; type: 'stored' | 'virtual' };
}

export interface JsonAlterColumnSetPrimaryKeyStatement {
	type: 'alter_table_alter_column_set_pk';
	tableName: string;
	schema: string;
	columnName: string;
}

export interface JsonAlterColumnDropPrimaryKeyStatement {
	type: 'alter_table_alter_column_drop_pk';
	tableName: string;
	columnName: string;
	schema: string;
}

export interface JsonAlterColumnSetDefaultStatement {
	type: 'alter_table_alter_column_set_default';
	tableName: string;
	columnName: string;
	newDefaultValue: any;
	oldDefaultValue?: any;
	schema: string;
	newDataType: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnDropDefaultStatement {
	type: 'alter_table_alter_column_drop_default';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnSetNotNullStatement {
	type: 'alter_table_alter_column_set_notnull';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnDropNotNullStatement {
	type: 'alter_table_alter_column_drop_notnull';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnSetGeneratedStatement {
	type: 'alter_table_alter_column_set_generated';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
	columnGenerated?: { as: string; type: 'stored' | 'virtual' };
}
export interface JsonAlterColumnSetIdentityStatement {
	type: 'alter_table_alter_column_set_identity';
	tableName: string;
	columnName: string;
	schema: string;
	identity: string;
}

export interface JsonAlterColumnDropIdentityStatement {
	type: 'alter_table_alter_column_drop_identity';
	tableName: string;
	columnName: string;
	schema: string;
}

export interface JsonAlterColumnAlterIdentityStatement {
	type: 'alter_table_alter_column_change_identity';
	tableName: string;
	columnName: string;
	schema: string;
	identity: string;
	oldIdentity: string;
}

export interface JsonAlterColumnDropGeneratedStatement {
	type: 'alter_table_alter_column_drop_generated';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
	columnGenerated?: { as: string; type: 'stored' | 'virtual' };
	oldColumn?: Column;
}

export interface JsonAlterColumnAlterGeneratedStatement {
	type: 'alter_table_alter_column_alter_generated';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
	columnGenerated?: { as: string; type: 'stored' | 'virtual' };
}

export interface JsonAlterColumnSetOnUpdateStatement {
	type: 'alter_table_alter_column_set_on_update';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnDropOnUpdateStatement {
	type: 'alter_table_alter_column_drop_on_update';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnSetAutoincrementStatement {
	type: 'alter_table_alter_column_set_autoincrement';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonAlterColumnDropAutoincrementStatement {
	type: 'alter_table_alter_column_drop_autoincrement';
	tableName: string;
	columnName: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnOnUpdate: boolean;
	columnNotNull: boolean;
	columnAutoIncrement: boolean;
	columnPk: boolean;
}

export interface JsonCreateSchema {
	type: 'create_schema';
	name: string;
}

export interface JsonDropSchema {
	type: 'drop_schema';
	name: string;
}

export interface JsonRenameSchema {
	type: 'rename_schema';
	from: string;
	to: string;
}

export type JsonAlterColumnStatement =
	| JsonRenameColumnStatement
	| JsonAlterColumnTypeStatement
	| JsonAlterColumnSetDefaultStatement
	| JsonAlterColumnDropDefaultStatement
	| JsonAlterColumnSetNotNullStatement
	| JsonAlterColumnDropNotNullStatement
	| JsonAlterColumnDropOnUpdateStatement
	| JsonAlterColumnSetOnUpdateStatement
	| JsonAlterColumnDropAutoincrementStatement
	| JsonAlterColumnSetAutoincrementStatement
	| JsonAlterColumnSetPrimaryKeyStatement
	| JsonAlterColumnDropPrimaryKeyStatement
	| JsonAlterColumnSetGeneratedStatement
	| JsonAlterColumnDropGeneratedStatement
	| JsonAlterColumnAlterGeneratedStatement
	| JsonAlterColumnSetIdentityStatement
	| JsonAlterColumnAlterIdentityStatement
	| JsonAlterColumnDropIdentityStatement;

export type JsonStatement =
	| JsonAlterColumnStatement
	| JsonCreateTableStatement
	| JsonDropTableStatement
	| JsonRenameTableStatement
	| JsonCreateEnumStatement
	| JsonDropEnumStatement
	| JsonMoveEnumStatement
	| JsonRenameEnumStatement
	| JsonAddValueToEnumStatement
	| JsonDropColumnStatement
	| JsonAddColumnStatement
	| JsonCreateIndexStatement
	| JsonCreateReferenceStatement
	| JsonAlterReferenceStatement
	| JsonDeleteReferenceStatement
	| JsonDropIndexStatement
	| JsonReferenceStatement
	| JsonSqliteCreateTableStatement
	| JsonSqliteAddColumnStatement
	| JsonCreateCompositePK
	| JsonDeleteCompositePK
	| JsonAlterCompositePK
	| JsonCreateUniqueConstraint
	| JsonDeleteUniqueConstraint
	| JsonAlterUniqueConstraint
	| JsonCreateSchema
	| JsonDropSchema
	| JsonRenameSchema
	| JsonAlterTableSetSchema
	| JsonAlterTableRemoveFromSchema
	| JsonAlterTableSetNewSchema
	| JsonPgCreateIndexStatement
	| JsonAlterSequenceStatement
	| JsonDropSequenceStatement
	| JsonCreateSequenceStatement
	| JsonMoveSequenceStatement
	| JsonRenameSequenceStatement;

export const preparePgCreateTableJson = (
	table: Table,
	// TODO: remove?
	json2: PgSchema,
): JsonCreateTableStatement => {
	const { name, schema, columns, compositePrimaryKeys, uniqueConstraints } = table;
	const tableKey = `${schema || 'public'}.${name}`;

	// TODO: @AndriiSherman. We need this, will add test cases
	const compositePkName = Object.values(compositePrimaryKeys).length > 0
		? json2.tables[tableKey].compositePrimaryKeys[
			`${PgSquasher.unsquashPK(Object.values(compositePrimaryKeys)[0]).name}`
		].name
		: '';

	return {
		type: 'create_table',
		tableName: name,
		schema,
		columns: Object.values(columns),
		compositePKs: Object.values(compositePrimaryKeys),
		compositePkName: compositePkName,
		uniqueConstraints: Object.values(uniqueConstraints),
	};
};

export const prepareMySqlCreateTableJson = (
	table: Table,
	// TODO: remove?
	json2: MySqlSchema,
	// we need it to know if some of the indexes(and in future other parts) are expressions or columns
	// didn't change mysqlserialaizer, because it will break snapshots and diffs and it's hard to detect
	// if previously it was an expression or column
	internals: MySqlKitInternals,
): JsonCreateTableStatement => {
	const { name, schema, columns, compositePrimaryKeys, uniqueConstraints } = table;

	return {
		type: 'create_table',
		tableName: name,
		schema,
		columns: Object.values(columns),
		compositePKs: Object.values(compositePrimaryKeys),
		compositePkName: Object.values(compositePrimaryKeys).length > 0
			? json2.tables[name].compositePrimaryKeys[
				MySqlSquasher.unsquashPK(Object.values(compositePrimaryKeys)[0])
					.name
			].name
			: '',
		uniqueConstraints: Object.values(uniqueConstraints),
		internals,
	};
};

export const prepareSQLiteCreateTable = (
	table: Table,
	action?: 'push' | undefined,
): JsonSqliteCreateTableStatement => {
	const { name, columns, uniqueConstraints } = table;

	const references: string[] = Object.values(table.foreignKeys);

	const composites: string[][] = Object.values(table.compositePrimaryKeys).map(
		(it) => SQLiteSquasher.unsquashPK(it),
	);

	const fks = references.map((it) =>
		action === 'push'
			? SQLiteSquasher.unsquashPushFK(it)
			: SQLiteSquasher.unsquashFK(it)
	);

	return {
		type: 'sqlite_create_table',
		tableName: name,
		columns: Object.values(columns),
		referenceData: fks,
		compositePKs: composites,
		uniqueConstraints: Object.values(uniqueConstraints),
	};
};

export const prepareDropTableJson = (table: Table): JsonDropTableStatement => {
	return {
		type: 'drop_table',
		tableName: table.name,
		schema: table.schema,
	};
};

export const prepareRenameTableJson = (
	tableFrom: Table,
	tableTo: Table,
): JsonRenameTableStatement => {
	return {
		type: 'rename_table',
		fromSchema: tableTo.schema,
		toSchema: tableTo.schema,
		tableNameFrom: tableFrom.name,
		tableNameTo: tableTo.name,
	};
};

export const prepareCreateEnumJson = (
	name: string,
	schema: string,
	values: string[],
): JsonCreateEnumStatement => {
	return {
		type: 'create_type_enum',
		name: name,
		schema: schema,
		values,
	};
};

// https://blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
export const prepareAddValuesToEnumJson = (
	name: string,
	schema: string,
	values: { value: string; before: string }[],
): JsonAddValueToEnumStatement[] => {
	return values.map((it) => {
		return {
			type: 'alter_type_add_value',
			name: name,
			schema: schema,
			value: it.value,
			before: it.before,
		};
	});
};

export const prepareDropEnumJson = (
	name: string,
	schema: string,
): JsonDropEnumStatement => {
	return {
		type: 'drop_type_enum',
		name: name,
		schema: schema,
	};
};

export const prepareMoveEnumJson = (
	name: string,
	schemaFrom: string,
	schemaTo: string,
): JsonMoveEnumStatement => {
	return {
		type: 'move_type_enum',
		name: name,
		schemaFrom,
		schemaTo,
	};
};

export const prepareRenameEnumJson = (
	nameFrom: string,
	nameTo: string,
	schema: string,
): JsonRenameEnumStatement => {
	return {
		type: 'rename_type_enum',
		nameFrom,
		nameTo,
		schema,
	};
};

////////////

export const prepareCreateSequenceJson = (
	seq: Sequence,
): JsonCreateSequenceStatement => {
	const values = PgSquasher.unsquashSequence(seq.values);
	return {
		type: 'create_sequence',
		name: seq.name,
		schema: seq.schema,
		values,
	};
};

export const prepareAlterSequenceJson = (
	seq: Sequence,
): JsonAlterSequenceStatement[] => {
	const values = PgSquasher.unsquashSequence(seq.values);
	return [
		{
			type: 'alter_sequence',
			schema: seq.schema,
			name: seq.name,
			values,
		},
	];
};

export const prepareDropSequenceJson = (
	name: string,
	schema: string,
): JsonDropSequenceStatement => {
	return {
		type: 'drop_sequence',
		name: name,
		schema: schema,
	};
};

export const prepareMoveSequenceJson = (
	name: string,
	schemaFrom: string,
	schemaTo: string,
): JsonMoveSequenceStatement => {
	return {
		type: 'move_sequence',
		name: name,
		schemaFrom,
		schemaTo,
	};
};

export const prepareRenameSequenceJson = (
	nameFrom: string,
	nameTo: string,
	schema: string,
): JsonRenameSequenceStatement => {
	return {
		type: 'rename_sequence',
		nameFrom,
		nameTo,
		schema,
	};
};

////////////

export const prepareCreateSchemasJson = (
	values: string[],
): JsonCreateSchema[] => {
	return values.map((it) => {
		return {
			type: 'create_schema',
			name: it,
		} as JsonCreateSchema;
	});
};

export const prepareRenameSchemasJson = (
	values: { from: string; to: string }[],
): JsonRenameSchema[] => {
	return values.map((it) => {
		return {
			type: 'rename_schema',
			from: it.from,
			to: it.to,
		} as JsonRenameSchema;
	});
};

export const prepareDeleteSchemasJson = (
	values: string[],
): JsonDropSchema[] => {
	return values.map((it) => {
		return {
			type: 'drop_schema',
			name: it,
		} as JsonDropSchema;
	});
};

export const prepareRenameColumns = (
	tableName: string,
	// TODO: split for pg and mysql+sqlite without schema
	schema: string,
	pairs: { from: Column; to: Column }[],
): JsonRenameColumnStatement[] => {
	return pairs.map((it) => {
		return {
			type: 'alter_table_rename_column',
			tableName: tableName,
			oldColumnName: it.from.name,
			newColumnName: it.to.name,
			schema,
		};
	});
};

export const _prepareDropColumns = (
	taleName: string,
	schema: string,
	columns: Column[],
): JsonDropColumnStatement[] => {
	return columns.map((it) => {
		return {
			type: 'alter_table_drop_column',
			tableName: taleName,
			columnName: it.name,
			schema,
		};
	});
};

export const _prepareAddColumns = (
	tableName: string,
	schema: string,
	columns: Column[],
): JsonAddColumnStatement[] => {
	return columns.map((it) => {
		return {
			type: 'alter_table_add_column',
			tableName: tableName,
			column: it,
			schema,
		};
	});
};

export const _prepareSqliteAddColumns = (
	tableName: string,
	columns: Column[],
	referenceData: string[],
): JsonSqliteAddColumnStatement[] => {
	const unsquashed = referenceData.map((addedFkValue) => SQLiteSquasher.unsquashFK(addedFkValue));

	return columns
		.map((it) => {
			const columnsWithReference = unsquashed.find((t) => t.columnsFrom.includes(it.name));

			if (it.generated?.type === 'stored') {
				warning(
					`As SQLite docs mention: "It is not possible to ALTER TABLE ADD COLUMN a STORED column. One can add a VIRTUAL column, however", source: "https://www.sqlite.org/gencol.html"`,
				);
				return undefined;
			}

			return {
				type: 'sqlite_alter_table_add_column',
				tableName: tableName,
				column: it,
				referenceData: columnsWithReference
					? SQLiteSquasher.squashFK(columnsWithReference)
					: undefined,
			};
		})
		.filter(Boolean) as JsonSqliteAddColumnStatement[];
};

export const prepareAlterColumnsMysql = (
	tableName: string,
	schema: string,
	columns: AlteredColumn[],
	// TODO: remove?
	json1: CommonSquashedSchema,
	json2: CommonSquashedSchema,
	action?: 'push' | undefined,
): JsonAlterColumnStatement[] => {
	let statements: JsonAlterColumnStatement[] = [];
	let dropPkStatements: JsonAlterColumnDropPrimaryKeyStatement[] = [];
	let setPkStatements: JsonAlterColumnSetPrimaryKeyStatement[] = [];

	for (const column of columns) {
		const columnName = typeof column.name !== 'string' ? column.name.new : column.name;

		const table = json2.tables[tableName];
		const snapshotColumn = table.columns[columnName];

		const columnType = snapshotColumn.type;
		const columnDefault = snapshotColumn.default;
		const columnOnUpdate = 'onUpdate' in snapshotColumn ? snapshotColumn.onUpdate : undefined;
		const columnNotNull = table.columns[columnName].notNull;

		const columnAutoIncrement = 'autoincrement' in snapshotColumn
			? snapshotColumn.autoincrement ?? false
			: false;

		const columnPk = table.columns[columnName].primaryKey;

		if (column.autoincrement?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_autoincrement',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.autoincrement?.type === 'changed') {
			const type = column.autoincrement.new
				? 'alter_table_alter_column_set_autoincrement'
				: 'alter_table_alter_column_drop_autoincrement';

			statements.push({
				type,
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.autoincrement?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_autoincrement',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}
	}

	for (const column of columns) {
		const columnName = typeof column.name !== 'string' ? column.name.new : column.name;

		// I used any, because those fields are available only for mysql dialect
		// For other dialects it will become undefined, that is fine for json statements
		const columnType = json2.tables[tableName].columns[columnName].type;
		const columnDefault = json2.tables[tableName].columns[columnName].default;
		const columnGenerated = json2.tables[tableName].columns[columnName].generated;
		const columnOnUpdate = (json2.tables[tableName].columns[columnName] as any)
			.onUpdate;
		const columnNotNull = json2.tables[tableName].columns[columnName].notNull;
		const columnAutoIncrement = (
			json2.tables[tableName].columns[columnName] as any
		).autoincrement;
		const columnPk = (json2.tables[tableName].columns[columnName] as any)
			.primaryKey;

		const compositePk = json2.tables[tableName].compositePrimaryKeys[
			`${tableName}_${columnName}`
		];

		if (typeof column.name !== 'string') {
			statements.push({
				type: 'alter_table_rename_column',
				tableName,
				oldColumnName: column.name.old,
				newColumnName: column.name.new,
				schema,
			});
		}

		if (column.type?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_type',
				tableName,
				columnName,
				newDataType: column.type.new,
				oldDataType: column.type.old,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (
			column.primaryKey?.type === 'deleted'
			|| (column.primaryKey?.type === 'changed'
				&& !column.primaryKey.new
				&& typeof compositePk === 'undefined')
		) {
			dropPkStatements.push({
				////
				type: 'alter_table_alter_column_drop_pk',
				tableName,
				columnName,
				schema,
			});
		}

		if (column.default?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.value,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.new,
				oldDefaultValue: column.default.old,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_default',
				tableName,
				columnName,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.notNull?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'changed') {
			const type = column.notNull.new
				? 'alter_table_alter_column_set_notnull'
				: 'alter_table_alter_column_drop_notnull';
			statements.push({
				type: type,
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.generated?.type === 'added') {
			if (columnGenerated?.type === 'virtual') {
				warning(
					`You are trying to add virtual generated constraint to ${
						chalk.blue(
							columnName,
						)
					} column. As MySQL docs mention: "Nongenerated columns can be altered to stored but not virtual generated columns". We will drop an existing column and add it with a virtual generated statement. This means that the data previously stored in this column will be wiped, and new data will be generated on each read for this column\n`,
				);
			}
			statements.push({
				type: 'alter_table_alter_column_set_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (column.generated?.type === 'changed' && action !== 'push') {
			statements.push({
				type: 'alter_table_alter_column_alter_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (column.generated?.type === 'deleted') {
			if (columnGenerated?.type === 'virtual') {
				warning(
					`You are trying to remove virtual generated constraint from ${
						chalk.blue(
							columnName,
						)
					} column. As MySQL docs mention: "Stored but not virtual generated columns can be altered to nongenerated columns. The stored generated values become the values of the nongenerated column". We will drop an existing column and add it without a virtual generated statement. This means that this column will have no data after migration\n`,
				);
			}
			statements.push({
				type: 'alter_table_alter_column_drop_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
				oldColumn: json1.tables[tableName].columns[columnName],
			});
		}

		if (
			column.primaryKey?.type === 'added'
			|| (column.primaryKey?.type === 'changed' && column.primaryKey.new)
		) {
			const wasAutoincrement = statements.filter(
				(it) => it.type === 'alter_table_alter_column_set_autoincrement',
			);
			if (wasAutoincrement.length === 0) {
				setPkStatements.push({
					type: 'alter_table_alter_column_set_pk',
					tableName,
					schema,
					columnName,
				});
			}
		}

		if (column.onUpdate?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.onUpdate?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}
	}

	return [...dropPkStatements, ...setPkStatements, ...statements];
};

export const preparePgAlterColumns = (
	_tableName: string,
	schema: string,
	columns: AlteredColumn[],
	// TODO: remove?
	json2: CommonSquashedSchema,
	action?: 'push' | undefined,
): JsonAlterColumnStatement[] => {
	const tableKey = `${schema || 'public'}.${_tableName}`;
	let statements: JsonAlterColumnStatement[] = [];
	let dropPkStatements: JsonAlterColumnDropPrimaryKeyStatement[] = [];
	let setPkStatements: JsonAlterColumnSetPrimaryKeyStatement[] = [];

	for (const column of columns) {
		const columnName = typeof column.name !== 'string' ? column.name.new : column.name;

		const tableName = json2.tables[tableKey].name;

		// I used any, because those fields are available only for mysql dialect
		// For other dialects it will become undefined, that is fine for json statements
		const columnType = json2.tables[tableKey].columns[columnName].type;
		const columnDefault = json2.tables[tableKey].columns[columnName].default;
		const columnGenerated = json2.tables[tableKey].columns[columnName].generated;
		const columnOnUpdate = (json2.tables[tableKey].columns[columnName] as any)
			.onUpdate;
		const columnNotNull = json2.tables[tableKey].columns[columnName].notNull;
		const columnAutoIncrement = (
			json2.tables[tableKey].columns[columnName] as any
		).autoincrement;
		const columnPk = (json2.tables[tableKey].columns[columnName] as any)
			.primaryKey;

		const compositePk = json2.tables[tableKey].compositePrimaryKeys[`${tableName}_${columnName}`];

		if (typeof column.name !== 'string') {
			statements.push({
				type: 'alter_table_rename_column',
				tableName,
				oldColumnName: column.name.old,
				newColumnName: column.name.new,
				schema,
			});
		}

		if (column.type?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_type',
				tableName,
				columnName,
				newDataType: column.type.new,
				oldDataType: column.type.old,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (
			column.primaryKey?.type === 'deleted'
			|| (column.primaryKey?.type === 'changed'
				&& !column.primaryKey.new
				&& typeof compositePk === 'undefined')
		) {
			dropPkStatements.push({
				////
				type: 'alter_table_alter_column_drop_pk',
				tableName,
				columnName,
				schema,
			});
		}

		if (column.default?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.value,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.new,
				oldDefaultValue: column.default.old,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_default',
				tableName,
				columnName,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.notNull?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'changed') {
			const type = column.notNull.new
				? 'alter_table_alter_column_set_notnull'
				: 'alter_table_alter_column_drop_notnull';
			statements.push({
				type: type,
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.identity?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_identity',
				tableName,
				columnName,
				schema,
				identity: column.identity.value,
			});
		}

		if (column.identity?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_change_identity',
				tableName,
				columnName,
				schema,
				identity: column.identity.new,
				oldIdentity: column.identity.old,
			});
		}

		if (column.identity?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_identity',
				tableName,
				columnName,
				schema,
			});
		}

		if (column.generated?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (column.generated?.type === 'changed' && action !== 'push') {
			statements.push({
				type: 'alter_table_alter_column_alter_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (column.generated?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (
			column.primaryKey?.type === 'added'
			|| (column.primaryKey?.type === 'changed' && column.primaryKey.new)
		) {
			const wasAutoincrement = statements.filter(
				(it) => it.type === 'alter_table_alter_column_set_autoincrement',
			);
			if (wasAutoincrement.length === 0) {
				setPkStatements.push({
					type: 'alter_table_alter_column_set_pk',
					tableName,
					schema,
					columnName,
				});
			}
		}

		// if (column.primaryKey?.type === "added") {
		//   statements.push({
		//     type: "alter_table_alter_column_set_primarykey",
		//     tableName,
		//     columnName,
		//     schema,
		//     newDataType: columnType,
		//     columnDefault,
		//     columnOnUpdate,
		//     columnNotNull,
		//     columnAutoIncrement,
		//   });
		// }

		// if (column.primaryKey?.type === "changed") {
		//   const type = column.primaryKey.new
		//     ? "alter_table_alter_column_set_primarykey"
		//     : "alter_table_alter_column_drop_primarykey";

		//   statements.push({
		//     type,
		//     tableName,
		//     columnName,
		//     schema,
		//     newDataType: columnType,
		//     columnDefault,
		//     columnOnUpdate,
		//     columnNotNull,
		//     columnAutoIncrement,
		//   });
		// }

		// if (column.primaryKey?.type === "deleted") {
		//   statements.push({
		//     type: "alter_table_alter_column_drop_primarykey",
		//     tableName,
		//     columnName,
		//     schema,
		//     newDataType: columnType,
		//     columnDefault,
		//     columnOnUpdate,
		//     columnNotNull,
		//     columnAutoIncrement,
		//   });
		// }

		if (column.onUpdate?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.onUpdate?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}
	}

	return [...dropPkStatements, ...setPkStatements, ...statements];
};

export const prepareSqliteAlterColumns = (
	tableName: string,
	schema: string,
	columns: AlteredColumn[],
	// TODO: remove?
	json2: CommonSquashedSchema,
): JsonAlterColumnStatement[] => {
	let statements: JsonAlterColumnStatement[] = [];
	let dropPkStatements: JsonAlterColumnDropPrimaryKeyStatement[] = [];
	let setPkStatements: JsonAlterColumnSetPrimaryKeyStatement[] = [];

	for (const column of columns) {
		const columnName = typeof column.name !== 'string' ? column.name.new : column.name;

		// I used any, because those fields are available only for mysql dialect
		// For other dialects it will become undefined, that is fine for json statements
		const columnType = json2.tables[tableName].columns[columnName].type;
		const columnDefault = json2.tables[tableName].columns[columnName].default;
		const columnOnUpdate = (json2.tables[tableName].columns[columnName] as any)
			.onUpdate;
		const columnNotNull = json2.tables[tableName].columns[columnName].notNull;
		const columnAutoIncrement = (
			json2.tables[tableName].columns[columnName] as any
		).autoincrement;
		const columnPk = (json2.tables[tableName].columns[columnName] as any)
			.primaryKey;

		const columnGenerated = json2.tables[tableName].columns[columnName].generated;

		const compositePk = json2.tables[tableName].compositePrimaryKeys[
			`${tableName}_${columnName}`
		];

		if (typeof column.name !== 'string') {
			statements.push({
				type: 'alter_table_rename_column',
				tableName,
				oldColumnName: column.name.old,
				newColumnName: column.name.new,
				schema,
			});
		}

		if (column.type?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_type',
				tableName,
				columnName,
				newDataType: column.type.new,
				oldDataType: column.type.old,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (
			column.primaryKey?.type === 'deleted'
			|| (column.primaryKey?.type === 'changed'
				&& !column.primaryKey.new
				&& typeof compositePk === 'undefined')
		) {
			dropPkStatements.push({
				////
				type: 'alter_table_alter_column_drop_pk',
				tableName,
				columnName,
				schema,
			});
		}

		if (column.default?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.value,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'changed') {
			statements.push({
				type: 'alter_table_alter_column_set_default',
				tableName,
				columnName,
				newDefaultValue: column.default.new,
				oldDefaultValue: column.default.old,
				schema,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.default?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_default',
				tableName,
				columnName,
				schema,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				newDataType: columnType,
				columnPk,
			});
		}

		if (column.notNull?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'changed') {
			const type = column.notNull.new
				? 'alter_table_alter_column_set_notnull'
				: 'alter_table_alter_column_drop_notnull';
			statements.push({
				type: type,
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.notNull?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_notnull',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.generated?.type === 'added') {
			if (columnGenerated?.type === 'virtual') {
				statements.push({
					type: 'alter_table_alter_column_set_generated',
					tableName,
					columnName,
					schema,
					newDataType: columnType,
					columnDefault,
					columnOnUpdate,
					columnNotNull,
					columnAutoIncrement,
					columnPk,
					columnGenerated,
				});
			} else {
				warning(
					`As SQLite docs mention: "It is not possible to ALTER TABLE ADD COLUMN a STORED column. One can add a VIRTUAL column, however", source: "https://www.sqlite.org/gencol.html"`,
				);
			}
		}

		if (column.generated?.type === 'changed') {
			if (columnGenerated?.type === 'virtual') {
				statements.push({
					type: 'alter_table_alter_column_alter_generated',
					tableName,
					columnName,
					schema,
					newDataType: columnType,
					columnDefault,
					columnOnUpdate,
					columnNotNull,
					columnAutoIncrement,
					columnPk,
					columnGenerated,
				});
			} else {
				warning(
					`As SQLite docs mention: "It is not possible to ALTER TABLE ADD COLUMN a STORED column. One can add a VIRTUAL column, however", source: "https://www.sqlite.org/gencol.html"`,
				);
			}
		}

		if (column.generated?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_generated',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
				columnGenerated,
			});
		}

		if (
			column.primaryKey?.type === 'added'
			|| (column.primaryKey?.type === 'changed' && column.primaryKey.new)
		) {
			const wasAutoincrement = statements.filter(
				(it) => it.type === 'alter_table_alter_column_set_autoincrement',
			);
			if (wasAutoincrement.length === 0) {
				setPkStatements.push({
					type: 'alter_table_alter_column_set_pk',
					tableName,
					schema,
					columnName,
				});
			}
		}

		if (column.onUpdate?.type === 'added') {
			statements.push({
				type: 'alter_table_alter_column_set_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}

		if (column.onUpdate?.type === 'deleted') {
			statements.push({
				type: 'alter_table_alter_column_drop_on_update',
				tableName,
				columnName,
				schema,
				newDataType: columnType,
				columnDefault,
				columnOnUpdate,
				columnNotNull,
				columnAutoIncrement,
				columnPk,
			});
		}
	}

	return [...dropPkStatements, ...setPkStatements, ...statements];
};

export const preparePgCreateIndexesJson = (
	tableName: string,
	schema: string,
	indexes: Record<string, string>,
	fullSchema: PgSchema,
	action?: 'push' | undefined,
): JsonPgCreateIndexStatement[] => {
	if (action === 'push') {
		return Object.values(indexes).map((indexData) => {
			const unsquashedIndex = PgSquasher.unsquashIdxPush(indexData);
			const data = fullSchema.tables[`${schema === '' ? 'public' : schema}.${tableName}`]
				.indexes[unsquashedIndex.name];
			return {
				type: 'create_index_pg',
				tableName,
				data,
				schema,
			};
		});
	}
	return Object.values(indexes).map((indexData) => {
		return {
			type: 'create_index_pg',
			tableName,
			data: PgSquasher.unsquashIdx(indexData),
			schema,
		};
	});
};

export const prepareCreateIndexesJson = (
	tableName: string,
	schema: string,
	indexes: Record<string, string>,
	internal?: MySqlKitInternals | SQLiteKitInternals,
): JsonCreateIndexStatement[] => {
	return Object.values(indexes).map((indexData) => {
		return {
			type: 'create_index',
			tableName,
			data: indexData,
			schema,
			internal,
		};
	});
};

export const prepareCreateReferencesJson = (
	tableName: string,
	schema: string,
	foreignKeys: Record<string, string>,
): JsonCreateReferenceStatement[] => {
	return Object.values(foreignKeys).map((fkData) => {
		return {
			type: 'create_reference',
			tableName,
			data: fkData,
			schema,
		};
	});
};

export const prepareDropReferencesJson = (
	tableName: string,
	schema: string,
	foreignKeys: Record<string, string>,
): JsonDeleteReferenceStatement[] => {
	return Object.values(foreignKeys).map((fkData) => {
		return {
			type: 'delete_reference',
			tableName,
			data: fkData,
			schema,
		};
	});
};

// alter should create 2 statements. It's important to make only 1 sql per statement(for breakpoints)
export const prepareAlterReferencesJson = (
	tableName: string,
	schema: string,
	foreignKeys: Record<string, { __old: string; __new: string }>,
): JsonReferenceStatement[] => {
	const stmts: JsonReferenceStatement[] = [];
	Object.values(foreignKeys).map((val) => {
		stmts.push({
			type: 'delete_reference',
			tableName,
			schema,
			data: val.__old,
		});

		stmts.push({
			type: 'create_reference',
			tableName,
			schema,
			data: val.__new,
		});
	});
	return stmts;
};

export const prepareDropIndexesJson = (
	tableName: string,
	schema: string,
	indexes: Record<string, string>,
): JsonDropIndexStatement[] => {
	return Object.values(indexes).map((indexData) => {
		return {
			type: 'drop_index',
			tableName,
			data: indexData,
			schema,
		};
	});
};

export const prepareAddCompositePrimaryKeySqlite = (
	tableName: string,
	pks: Record<string, string>,
): JsonCreateCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'create_composite_pk',
			tableName,
			data: it,
		} as JsonCreateCompositePK;
	});
};

export const prepareDeleteCompositePrimaryKeySqlite = (
	tableName: string,
	pks: Record<string, string>,
): JsonDeleteCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'delete_composite_pk',
			tableName,
			data: it,
		} as JsonDeleteCompositePK;
	});
};

export const prepareAlterCompositePrimaryKeySqlite = (
	tableName: string,
	pks: Record<string, { __old: string; __new: string }>,
): JsonAlterCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'alter_composite_pk',
			tableName,
			old: it.__old,
			new: it.__new,
		} as JsonAlterCompositePK;
	});
};

export const prepareAddCompositePrimaryKeyPg = (
	tableName: string,
	schema: string,
	pks: Record<string, string>,
	// TODO: remove?
	json2: PgSchema,
): JsonCreateCompositePK[] => {
	return Object.values(pks).map((it) => {
		const unsquashed = PgSquasher.unsquashPK(it);
		return {
			type: 'create_composite_pk',
			tableName,
			data: it,
			schema,
			constraintName: json2.tables[`${schema || 'public'}.${tableName}`].compositePrimaryKeys[
				unsquashed.name
			].name,
		} as JsonCreateCompositePK;
	});
};

export const prepareDeleteCompositePrimaryKeyPg = (
	tableName: string,
	schema: string,
	pks: Record<string, string>,
	// TODO: remove?
	json1: PgSchema,
): JsonDeleteCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'delete_composite_pk',
			tableName,
			data: it,
			schema,
			constraintName: json1.tables[`${schema || 'public'}.${tableName}`].compositePrimaryKeys[
				PgSquasher.unsquashPK(it).name
			].name,
		} as JsonDeleteCompositePK;
	});
};

export const prepareAlterCompositePrimaryKeyPg = (
	tableName: string,
	schema: string,
	pks: Record<string, { __old: string; __new: string }>,
	// TODO: remove?
	json1: PgSchema,
	json2: PgSchema,
): JsonAlterCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'alter_composite_pk',
			tableName,
			old: it.__old,
			new: it.__new,
			schema,
			oldConstraintName: json1.tables[`${schema || 'public'}.${tableName}`].compositePrimaryKeys[
				PgSquasher.unsquashPK(it.__old).name
			].name,
			newConstraintName: json2.tables[`${schema || 'public'}.${tableName}`].compositePrimaryKeys[
				PgSquasher.unsquashPK(it.__new).name
			].name,
		} as JsonAlterCompositePK;
	});
};

export const prepareAddUniqueConstraintPg = (
	tableName: string,
	schema: string,
	unqs: Record<string, string>,
): JsonCreateUniqueConstraint[] => {
	return Object.values(unqs).map((it) => {
		return {
			type: 'create_unique_constraint',
			tableName,
			data: it,
			schema,
		} as JsonCreateUniqueConstraint;
	});
};

export const prepareDeleteUniqueConstraintPg = (
	tableName: string,
	schema: string,
	unqs: Record<string, string>,
): JsonDeleteUniqueConstraint[] => {
	return Object.values(unqs).map((it) => {
		return {
			type: 'delete_unique_constraint',
			tableName,
			data: it,
			schema,
		} as JsonDeleteUniqueConstraint;
	});
};

// add create table changes
// add handler to make drop and add and not alter(looking at __old and __new)
// add serializer for mysql and sqlite + types
// add introspect serializer for pg+sqlite+mysql
// add introspect actual code
// add push sqlite handler
// add push mysql warning if data exists and may have unique conflict
// add release notes
// add docs changes

export const prepareAlterUniqueConstraintPg = (
	tableName: string,
	schema: string,
	unqs: Record<string, { __old: string; __new: string }>,
): JsonAlterUniqueConstraint[] => {
	return Object.values(unqs).map((it) => {
		return {
			type: 'alter_unique_constraint',
			tableName,
			old: it.__old,
			new: it.__new,
			schema,
		} as JsonAlterUniqueConstraint;
	});
};

export const prepareAddCompositePrimaryKeyMySql = (
	tableName: string,
	pks: Record<string, string>,
	// TODO: remove?
	json1: MySqlSchema,
	json2: MySqlSchema,
): JsonCreateCompositePK[] => {
	const res: JsonCreateCompositePK[] = [];
	for (const it of Object.values(pks)) {
		const unsquashed = MySqlSquasher.unsquashPK(it);

		if (
			unsquashed.columns.length === 1
			&& json1.tables[tableName]?.columns[unsquashed.columns[0]]?.primaryKey
		) {
			continue;
		}

		res.push({
			type: 'create_composite_pk',
			tableName,
			data: it,
			constraintName: json2.tables[tableName].compositePrimaryKeys[unsquashed.name].name,
		} as JsonCreateCompositePK);
	}
	return res;
};

export const prepareDeleteCompositePrimaryKeyMySql = (
	tableName: string,
	pks: Record<string, string>,
	// TODO: remove?
	json1: MySqlSchema,
): JsonDeleteCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'delete_composite_pk',
			tableName,
			data: it,
			constraintName: json1.tables[tableName].compositePrimaryKeys[
				MySqlSquasher.unsquashPK(it).name
			].name,
		} as JsonDeleteCompositePK;
	});
};

export const prepareAlterCompositePrimaryKeyMySql = (
	tableName: string,
	pks: Record<string, { __old: string; __new: string }>,
	// TODO: remove?
	json1: MySqlSchema,
	json2: MySqlSchema,
): JsonAlterCompositePK[] => {
	return Object.values(pks).map((it) => {
		return {
			type: 'alter_composite_pk',
			tableName,
			old: it.__old,
			new: it.__new,
			oldConstraintName: json1.tables[tableName].compositePrimaryKeys[
				MySqlSquasher.unsquashPK(it.__old).name
			].name,
			newConstraintName: json2.tables[tableName].compositePrimaryKeys[
				MySqlSquasher.unsquashPK(it.__new).name
			].name,
		} as JsonAlterCompositePK;
	});
};
