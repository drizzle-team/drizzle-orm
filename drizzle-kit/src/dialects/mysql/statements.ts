import type { Simplify } from '../../utils';
import type { CheckConstraint, Column, DiffEntities, ForeignKey, Index, PrimaryKey, TableFull, View } from './ddl';

export interface CreateTable {
	type: 'create_table';
	table: TableFull;
}

export interface DropTable {
	type: 'drop_table';
	table: string;
}
export interface RenameTable {
	type: 'rename_table';
	from: string;
	to: string;
}

export interface AddColumn {
	type: 'add_column';
	column: Column;
	isPK: boolean;
}

export interface DropColumn {
	type: 'drop_column';
	column: Column;
}

export interface RenameColumn {
	type: 'rename_column';
	table: string;
	from: string;
	to: string;
}

export interface AlterColumn {
	type: 'alter_column';
	diff: DiffEntities['columns'];
	column: Column;
	isPK: boolean;
	wasPK: boolean;
	origin: {
		column: string;
		table: string;
	};
}

export interface RecreateColumn {
	type: 'recreate_column';
	column: Column;
	isPK: boolean;
	diff: DiffEntities['columns'];
}

export interface CreateIndex {
	type: 'create_index';
	index: Index;
}

export interface DropIndex {
	type: 'drop_index';
	index: Index;
}

export interface CreateFK {
	type: 'create_fk';
	fk: ForeignKey;
	cause?: 'alter_pk';
}

export interface CreatePK {
	type: 'create_pk';
	pk: PrimaryKey;
}

export interface CreatePK {
	type: 'create_pk';
	pk: PrimaryKey;
}

export interface DropPK {
	type: 'drop_pk';
	pk: PrimaryKey;
}

export interface DropConstraint {
	type: 'drop_constraint';
	table: string;
	constraint: string;
	dropAutoIndex: boolean;
}

export interface CreateView {
	type: 'create_view';
	view: View;
	replace: boolean;
}

export interface DropView {
	type: 'drop_view';
	name: string;
}

export interface RenameView {
	type: 'rename_view';
	from: string;
	to: string;
}

export interface AlterView {
	type: 'alter_view';
	diff: DiffEntities['views'];
	view: View;
}

export interface CreateCheck {
	type: 'create_check';
	check: CheckConstraint;
}

export type JsonStatement =
	| CreateTable
	| DropTable
	| RenameTable
	| AddColumn
	| DropColumn
	| RenameColumn
	| AlterColumn
	| RecreateColumn
	| CreateIndex
	| DropIndex
	| CreateFK
	| CreatePK
	| DropPK
	| CreateView
	| DropView
	| RenameView
	| AlterView
	| DropConstraint
	| CreateCheck;

export const prepareStatement = <
	TType extends JsonStatement['type'],
	TStatement extends Extract<JsonStatement, { type: TType }>,
>(
	type: TType,
	args: Omit<TStatement, 'type'>,
): Simplify<TStatement> => {
	return {
		type,
		...args,
	} as TStatement;
};
