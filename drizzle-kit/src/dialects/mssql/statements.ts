import type { Simplify } from '../../utils';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	DiffEntities,
	ForeignKey,
	Index,
	PrimaryKey,
	Schema,
	TableFull,
	UniqueConstraint,
	View,
} from './ddl';

export interface CreateSchema {
	type: 'create_schema';
	name: string;
}

export interface DropSchema {
	type: 'drop_schema';
	name: string;
}

export interface RenameSchema {
	type: 'rename_schema';
	from: Schema;
	to: Schema;
}

export interface CreateTable {
	type: 'create_table';
	table: TableFull;
}

export interface DropTable {
	type: 'drop_table';
	table: TableFull;
}
export interface RenameTable {
	type: 'rename_table';
	from: string;
	to: string;
	schema: string;
}

export interface AddColumn {
	type: 'add_column';
	column: Column;
	defaults: DefaultConstraint[];
	isPK: boolean;
}

export interface DropColumn {
	type: 'drop_column';
	column: Column;
}

export interface RenameColumn {
	type: 'rename_column';
	from: Column;
	to: Column;
}

export interface AlterColumn {
	type: 'alter_column';
	diff: DiffEntities['columns'];
}

export interface RecreateIdentityColumn {
	type: 'recreate_identity_column';
	column: DiffEntities['columns'];
	defaults: DefaultConstraint[];
	constraintsToDelete: (UniqueConstraint | CheckConstraint | Index | PrimaryKey | ForeignKey | DefaultConstraint)[];
	constraintsToCreate: (UniqueConstraint | CheckConstraint | Index | PrimaryKey | ForeignKey | DefaultConstraint)[];
}
export interface RecreateColumn {
	type: 'recreate_column';
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
}
export interface DropFK {
	type: 'drop_fk';
	fk: ForeignKey;
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
	schema: string;
	constraint: string;
}

export interface CreateView {
	type: 'create_view';
	view: View;
}

export interface DropView {
	type: 'drop_view';
	view: View;
}

export interface RenameView {
	type: 'rename_view';
	from: View;
	to: View;
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

export interface CreateUnique {
	type: 'add_unique';
	unique: UniqueConstraint;
}

export interface DeleteUnique {
	type: 'drop_unique';
	unique: UniqueConstraint;
}

export interface MoveTable {
	type: 'move_table';
	name: string;
	from: string;
	to: string;
}

export interface AddCheck {
	type: 'add_check';
	check: CheckConstraint;
}

export interface DropCheck {
	type: 'drop_check';
	check: CheckConstraint;
}

export interface MoveView {
	type: 'move_view';
	fromSchema: string;
	toSchema: string;
	view: View;
}

export interface RenamePrimaryKey {
	type: 'rename_pk';
	from: PrimaryKey;
	to: PrimaryKey;
}

export interface RenameCheck {
	type: 'rename_check';
	from: CheckConstraint;
	to: CheckConstraint;
}

export interface RenameIndex {
	type: 'rename_index';
	from: Index;
	to: Index;
}

export interface RenameForeignKey {
	type: 'rename_fk';
	from: ForeignKey;
	to: ForeignKey;
}

export interface RenameUnique {
	type: 'rename_unique';
	from: UniqueConstraint;
	to: UniqueConstraint;
}

export interface CreateDefault {
	type: 'create_default';
	default: DefaultConstraint;
}

export interface DropDefault {
	type: 'drop_default';
	default: DefaultConstraint;
}

export interface RecreateDefault {
	type: 'recreate_default';
	from: DefaultConstraint;
	to: DefaultConstraint;
}

export type JsonStatement =
	| CreateSchema
	| DropSchema
	| RenameSchema
	| MoveView
	| AddCheck
	| DropCheck
	| MoveTable
	| CreateUnique
	| DeleteUnique
	| CreateTable
	| DropTable
	| RenameTable
	| AddColumn
	| DropColumn
	| RenameColumn
	| AlterColumn
	| RecreateColumn
	| RecreateIdentityColumn
	| CreateIndex
	| DropIndex
	| CreateFK
	| DropFK
	| CreatePK
	| DropPK
	| CreateView
	| DropView
	| RenameView
	| AlterView
	| DropConstraint
	| CreateCheck
	| RenamePrimaryKey
	| RenameCheck
	| RenameIndex
	| RenameForeignKey
	| RenameUnique
	| CreateDefault
	| DropDefault
	| RecreateDefault;

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
