import type { DiffEntities } from '../cockroach/ddl';
import type { Column, DiffColumn, ForeignKey, Index, SQLiteDDL, TableFull, View } from './ddl';

export interface JsonCreateTableStatement {
	type: 'create_table';
	table: TableFull;
}

export interface JsonRecreateTableStatement {
	type: 'recreate_table';
	to: TableFull;
	from: TableFull;
	checkDiffs: SQLiteDDL['_']['diffs']['createdrop']['checks'][];
	uniquesDiff: SQLiteDDL['_']['diffs']['createdrop']['uniques'][];
	pksDiff: SQLiteDDL['_']['diffs']['createdrop']['pks'][];
	fksDiff: SQLiteDDL['_']['diffs']['createdrop']['fks'][];
	indexesDiff: SQLiteDDL['_']['diffs']['createdrop']['indexes'][];

	alteredColumnsBecameGenerated: SQLiteDDL['_']['diffs']['alter']['columns'][];
	newStoredColumns: Column[];

	columnAlters: SQLiteDDL['_']['diffs']['alter']['columns'][];
	pksAlters: SQLiteDDL['_']['diffs']['alter']['pks'][];
	fksAlters: SQLiteDDL['_']['diffs']['alter']['fks'][];
	uniquesAlters: SQLiteDDL['_']['diffs']['alter']['uniques'][];
	checksAlters: SQLiteDDL['_']['diffs']['alter']['checks'][];
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
	type: 'drop_column';
	column: Column;
}

export interface JsonAddColumnStatement {
	type: 'add_column';
	column: Column;
	fk: ForeignKey | null;
}

export interface JsonCreateIndexStatement {
	type: 'create_index';
	index: Index;
}

export interface JsonDropIndexStatement {
	type: 'drop_index';
	index: Index;
}

export interface JsonRenameColumnStatement {
	type: 'rename_column';
	table: string;
	from: string;
	to: string;
}

export interface JsonRecreateColumnStatement {
	type: 'recreate_column';
	column: Column;
	diffGenerated: DiffEntities['columns']['generated'];
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
		const fk = fks.find((t) => t.columns.length === 1 && t.columns[0] === it.name && t.table === it.table) || null;
		return {
			type: 'add_column',
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
			type: 'recreate_column',
			diffGenerated: diffColumn.generated,
			column: column,
			fk: fk,
		};
	}

	throw new Error('unexpected');
};
