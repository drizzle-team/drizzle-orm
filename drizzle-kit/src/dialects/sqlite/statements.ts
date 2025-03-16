import { Column, DiffColumn, ForeignKey, Index, Table, View } from './ddl';

export interface JsonCreateTableStatement {
	type: 'create_table';
	table: Table;
}

export interface JsonRecreateTableStatement {
	type: 'recreate_table';
	table: Table;
}

export interface JsonDropTableStatement {
	type: 'drop_table';
	tableName: string;
}

export interface JsonRenameTableStatement {
	type: 'rename_table';
	from: string;
	to: string;
}

export interface JsonDropColumnStatement {
	type: 'alter_table_drop_column';
	column: Column;
}

export interface JsonAddColumnStatement {
	type: 'alter_table_add_column';
	column: Column;
	fk: ForeignKey | null;
}

export interface JsonCreateIndexStatement {
	type: 'add_index';
	index: Index;
}

export interface JsonDropIndexStatement {
	type: 'drop_index';
	index: Index;
}

export interface JsonRenameColumnStatement {
	type: 'alter_table_rename_column';
	tableName: string;
	from: string;
	to: string;
}

export interface JsonRecreateColumnStatement {
	type: 'alter_table_recreate_column';
	column: Column;
	fk: ForeignKey | null;
}

export type JsonCreateViewStatement = {
	type: 'create_view';
	view: View;
};

export interface JsonDropViewStatement {
	type: 'drop_view';
	view: View;
}

export interface JsonRenameViewStatement {
	type: 'rename_view';
	from: View;
	to: View;
}

export type JsonStatement =
	| JsonRecreateTableStatement
	| JsonRecreateColumnStatement
	| JsonRenameColumnStatement
	| JsonRecreateColumnStatement
	| JsonDropTableStatement
	| JsonRenameTableStatement
	| JsonDropColumnStatement
	| JsonCreateIndexStatement
	| JsonDropIndexStatement
	| JsonCreateTableStatement
	| JsonAddColumnStatement
	| JsonDropViewStatement
	| JsonRenameViewStatement
	| JsonCreateViewStatement;

export const prepareStatement = <
	TType extends JsonStatement['type'],
	TStatement extends Extract<JsonStatement, { type: TType }>,
>(
	type: TType,
	args: Omit<TStatement, 'type'>,
): TStatement => {
	return {
		type,
		...args,
	} as TStatement;
};

export const prepareAddColumns = (
	columns: Column[],
	fks: ForeignKey[],
): JsonAddColumnStatement[] => {
	return columns.map((it) => {
		const fk = fks.find((t) => t.columnsFrom.includes(it.name)) || null;
		return {
			type: 'alter_table_add_column',
			column: it,
			fk,
		} satisfies JsonAddColumnStatement;
	});
};

export const prepareRecreateColumn = (
	diffColumn: DiffColumn,
	column: Column,
	fk: ForeignKey | null,
): JsonRecreateColumnStatement => {
	// there're no other updates of entities, apart from name changes/some deletions+creations
	// which doesn't trigger recreate
	if (diffColumn.generated) {
		return {
			type: 'alter_table_recreate_column',
			column: column,
			fk: fk,
		};
	}

	throw new Error('unexpected');
};
