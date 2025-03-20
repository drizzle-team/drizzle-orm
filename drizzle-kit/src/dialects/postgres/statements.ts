import { Simplify } from '../../utils';
import { DiffColumn } from '../sqlite/ddl';
import type {
	CheckConstraint,
	Column,
	DiffEntities,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	Table,
	UniqueConstraint,
	View,
} from './ddl';

export interface JsonCreateTable {
	type: 'create_table';
	table: Table;
}

export interface JsonRecreateTable {
	type: 'recreate_table';
	table: Table;
}

export interface JsonDropTable {
	type: 'drop_table';
	table: Table;
}

export interface JsonRenameTable {
	type: 'rename_table';
	from: PostgresEntities['tables'];
	to: PostgresEntities['tables'];
}

export interface JsonCreateEnum {
	type: 'create_enum';
	enum: Enum;
}

export interface JsonDropEnum {
	type: 'drop_enum';
	enum: Enum;
}

export interface JsonMoveEnum {
	type: 'move_enum';
	name: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonRenameEnum {
	type: 'rename_enum';
	from: Enum;
	to: Enum;
}

export interface JsonRecreateEnum {
	type: 'recreate_enum';
	to: Enum;
	columns: Column[];
}

export interface JsonAlterEnum {
	type: 'alter_enum';
	enum: Enum;
	diff: {
		type: 'same' | 'removed' | 'added';
		value: string;
		beforeValue?: string;
	}[];
}

export interface JsonCreateRole {
	type: 'create_role';
	role: Role;
}

export interface JsonDropRole {
	type: 'drop_role';
	role: Role;
}
export interface JsonRenameRole {
	type: 'rename_role';
	from: Role;
	to: Role;
}

export interface JsonAlterRole {
	type: 'alter_role';
	diff: DiffEntities['roles'];
	role: Role;
}

export interface JsonDropValueFromEnum {
	type: 'alter_type_drop_value';
	deletedValues: string[];
	enum: Enum;
	columns: Column[];
}

export interface JsonCreateSequence {
	type: 'create_sequence';
	sequence: Sequence;
}

export interface JsonDropSequence {
	type: 'drop_sequence';
	sequence: Sequence;
}

export interface JsonMoveSequence {
	type: 'move_sequence';
	name: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonRenameSequence {
	type: 'rename_sequence';
	from: Sequence;
	to: Sequence;
}

export interface JsonAlterSequence {
	type: 'alter_sequence';
	diff: DiffEntities['sequences'];
	sequence: Sequence;
}

export interface JsonDropColumn {
	type: 'drop_column';
	column: Column;
}

export interface JsonAddColumn {
	type: 'add_column';
	column: Column;
}

export interface JsonCreatePolicy {
	type: 'create_policy';
	policy: Policy;
}

export interface JsonDropPolicy {
	type: 'drop_policy';
	policy: Policy;
}

export interface JsonRenamePolicy {
	type: 'rename_policy';
	from: Policy;
	to: Policy;
}

export interface JsonCreateIndPolicy {
	type: 'create_ind_policy';
	data: Policy;
}

export interface JsonDropIndPolicy {
	type: 'drop_ind_policy';
	data: Policy;
}

export interface JsonIndRenamePolicy {
	type: 'rename_ind_policy';
	tableKey: string;
	oldName: string;
	newName: string;
}

export interface JsonAlterRLS {
	type: 'alter_rls';
	table: PostgresEntities['tables'];
	isRlsEnabled: boolean;
}

export interface JsonAlterPolicy {
	type: 'alter_policy';
	diff: DiffEntities['policies'];
	policy: Policy;
}

export interface JsonAlterIndPolicy {
	type: 'alter_ind_policy';
	oldData: Policy;
	newData: Policy;
}

export interface JsonCreateIndex {
	type: 'create_index';
	index: Index;
}

export interface JsonCreateFK {
	type: 'create_fk';
	fk: ForeignKey;
}

export interface JsonDropFK {
	type: 'drop_fk';
	fk: ForeignKey;
}

export interface JsonAlterFK {
	type: 'alter_fk';
	diff: DiffEntities['fks'];
	from: ForeignKey;
	to: ForeignKey;
}

export interface JsonRenameFK {
	type: 'rename_fk';
	from: ForeignKey;
	to: ForeignKey;
}

export interface JsonCreateUnique {
	type: 'add_unique';
	unique: UniqueConstraint;
}

export interface JsonDeleteUnique {
	type: 'drop_unique';
	unique: UniqueConstraint;
}

export interface JsonRenameUnique {
	type: 'rename_unique';
	from: UniqueConstraint;
	to: UniqueConstraint;
}

export interface JsonAlterUnique {
	type: 'alter_unique';
	diff: DiffEntities['uniques'];
}

export interface JsonAddCheck {
	type: 'add_check';
	check: CheckConstraint;
}

export interface JsonDropCheck {
	type: 'drop_check';
	check: CheckConstraint;
}

export interface JsonAlterCheckConstraint {
	type: 'alter_check';
	diff: DiffEntities['checks'];
}

export interface JsonAddPrimaryKey {
	type: 'add_pk';
	pk: PrimaryKey;
}

export interface JsonDropPrimaryKey {
	type: 'drop_pk';
	pk: PrimaryKey;
}

export interface JsonRenamePrimaryKey {
	type: 'rename_pk';
	from: { schema: string | null; table: string; name: string };
	to: { schema: string | null; table: string; name: string };
}

export interface JsonAlterPrimaryKey {
	type: 'alter_pk';
	diff: DiffEntities['pks'];
}

export interface JsonMoveTable {
	type: 'move_table';
	name: string;
	schemaFrom: string;
	schemaTo: string;
}

export interface JsonAlterTableRemoveFromSchema {
	type: 'remove_from_schema';
	table: string;
	schema: string;
}

export interface JsonAlterTableSetNewSchema {
	type: 'set_new_schema';
	table: string;
	from: string;
	to: string;
}

export interface JsonDropIndex {
	type: 'drop_index';
	index: Index;
}

export interface JsonRenameColumn {
	type: 'rename_column';
	from: Column;
	to: Column;
}

export interface JsonAlterColumn {
	type: 'alter_column';
	column: Column;
	diff: DiffEntities['columns'];
}

export interface JsonRecreateColumn {
	type: 'recreate_column';
	column: Column;
}

export interface JsonAlterColumnSetPrimaryKey {
	type: 'alter_column_set_pk';
	table: string;
	schema: string;
	column: string;
}

export interface JsonAlterColumnDropPrimaryKey {
	type: 'alter_column_change_pk';
	column: Column;
	diff: DiffColumn['primaryKey'];
}

export interface JsonAlterColumnChangeGenerated {
	type: 'alter_column_change_generated';
	column: Column;
}
export interface JsonAlterColumnChangeIdentity {
	type: 'alter_column_change_identity';
	column: Column;
}

export interface JsonAlterColumnAlterGenerated {
	type: 'alter_column_alter_generated';
	table: string;
	column: string;
	schema: string;
	newDataType: string;
	columnDefault: string;
	columnNotNull: boolean;
	columnPk: boolean;
	columnGenerated?: { as: string; type: 'stored' | 'virtual' };
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
	from: Schema;
	to: Schema;
}

export interface JsonCreateView {
	type: 'create_view';
	view: View;
}

export interface JsonDropView {
	type: 'drop_view';
	view: View;
}

export interface JsonRenameView {
	type: 'rename_view';
	from: View;
	to: View;
}

export interface JsonMoveView {
	type: 'move_view';
	fromSchema: string;
	toSchema: string;
	view: View;
}

export interface JsonAlterView {
	type: 'alter_view';
	diff: DiffEntities['views'];
	from: View;
	to: View;
}

export interface JsonRecreateView {
	type: 'recreate_view';
	from: View;
	to: View;
}

export type JsonStatement =
	| JsonCreateTable
	| JsonDropTable
	| JsonRenameTable
	| JsonRecreateTable
	| JsonRenameColumn
	| JsonAlterColumn
	| JsonRecreateColumn
	| JsonMoveView
	| JsonAlterView
	| JsonRecreateView
	| JsonCreateEnum
	| JsonDropEnum
	| JsonMoveEnum
	| JsonRenameEnum
	| JsonRecreateEnum
	| JsonAlterEnum
	| JsonDropColumn
	| JsonAddColumn
	| JsonCreateIndex
	| JsonDropIndex
	| JsonAddPrimaryKey
	| JsonDropPrimaryKey
	| JsonRenamePrimaryKey
	| JsonAlterPrimaryKey
	| JsonCreateFK
	| JsonDropFK
	| JsonRenameFK
	| JsonAlterFK
	| JsonCreateUnique
	| JsonDeleteUnique
	| JsonRenameUnique
	| JsonAlterUnique
	| JsonDropCheck
	| JsonAddCheck
	| JsonCreateSchema
	| JsonDropSchema
	| JsonRenameSchema
	| JsonMoveTable
	| JsonAlterTableRemoveFromSchema
	| JsonAlterTableSetNewSchema
	| JsonAlterSequence
	| JsonDropSequence
	| JsonCreateSequence
	| JsonMoveSequence
	| JsonRenameSequence
	| JsonDropPolicy
	| JsonCreatePolicy
	| JsonAlterPolicy
	| JsonRenamePolicy
	| JsonAlterRLS
	| JsonRenameRole
	| JsonCreateRole
	| JsonDropRole
	| JsonAlterRole
	| JsonCreateView
	| JsonDropView
	| JsonRenameView
	| JsonAlterCheckConstraint
	| JsonDropValueFromEnum
	| JsonIndRenamePolicy
	| JsonDropIndPolicy
	| JsonCreateIndPolicy
	| JsonAlterIndPolicy;

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
