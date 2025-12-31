import type { Simplify } from '../../utils';
import type {
	CheckConstraint,
	Column,
	DiffEntities,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Privilege,
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

export interface JsonDropTable {
	type: 'drop_table';
	table: Table;
	key: string;
}

export interface JsonRenameTable {
	type: 'rename_table';
	schema: string;
	from: string;
	to: string;
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
	from: { name: string; schema: string | null };
	to: { name: string; schema: string | null };
}

export interface JsonRenameEnum {
	type: 'rename_enum';
	schema: string;
	from: string;
	to: string;
}

export interface JsonRecreateEnum {
	type: 'recreate_enum';
	to: Enum;
	columns: (Omit<Column, 'default'> & {
		default: {
			left: Column['default'];
			right: Column['default'];
		};
	})[];
	from: Enum;
}

export interface JsonAlterEnum {
	type: 'alter_enum';
	to: Enum;
	from: Enum;
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

export interface JsonGrantPrivilege {
	type: 'grant_privilege';
	privilege: Privilege;
}

export interface JsonRevokePrivilege {
	type: 'revoke_privilege';
	privilege: Privilege;
}

export interface JsonRegrantPrivilege {
	type: 'regrant_privilege';
	privilege: Privilege;
	diff: DiffEntities['privileges'];
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
	from: { name: string; schema: string | null };
	to: { name: string; schema: string | null };
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
	isPK: boolean;
	isCompositePK: boolean;
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

export interface JsonAlterRLS {
	type: 'alter_rls';
	schema: string;
	name: string;
	isRlsEnabled: boolean;
}

export interface JsonAlterPolicy {
	type: 'alter_policy';
	diff: DiffEntities['policies'];
	policy: Policy;
}
export interface JsonRecreatePolicy {
	type: 'recreate_policy';
	policy: Policy;
	diff: DiffEntities['policies'];
}

export interface JsonCreateIndex {
	type: 'create_index';
	index: Index;
}

export interface JsonRecreateIndex {
	type: 'recreate_index';
	index: Index;
	diff: DiffEntities['indexes'];
}

export interface JsonCreateFK {
	type: 'create_fk';
	fk: ForeignKey;
}

export interface JsonDropFK {
	type: 'drop_fk';
	fk: ForeignKey;
}

export interface JsonRecreateFK {
	type: 'recreate_fk';
	fk: ForeignKey;
	diff: DiffEntities['fks'];
}

export interface JsonCreateUnique {
	type: 'add_unique';
	unique: UniqueConstraint;
}

export interface JsonDeleteUnique {
	type: 'drop_unique';
	unique: UniqueConstraint;
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

export interface JsonAlterCheck {
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

export interface JsonRenameConstraint {
	type: 'rename_constraint';
	schema: string;
	table: string;
	from: string;
	to: string;
}

export interface JsonAlterPrimaryKey {
	type: 'alter_pk';
	pk: PrimaryKey;
	diff: DiffEntities['pks'];
	deleted?: boolean;
}

export interface JsonMoveTable {
	type: 'move_table';
	name: string;
	from: string;
	to: string;
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

export interface JsonRenameIndex {
	type: 'rename_index';
	schema: string;
	from: string;
	to: string;
}

export interface JsonRenameColumn {
	type: 'rename_column';
	from: Column;
	to: Column;
}

export interface JsonAlterColumn {
	type: 'alter_column';
	to: Column;
	wasEnum: boolean;
	isEnum: boolean;
	wasSerial: boolean;
	toSerial: boolean;
	diff: DiffEntities['columns'];
}

export interface JsonRecreateColumn {
	type: 'recreate_column';
	diff: DiffEntities['columns'];
	isPK: boolean;
}

export interface JsonAlterColumnSetPrimaryKey {
	type: 'alter_column_set_pk';
	table: string;
	schema: string;
	column: string;
}

export interface JsonAlterColumnChangeGenerated {
	type: 'alter_column_change_generated';
	column: Column;
}
export interface JsonAlterColumnChangeIdentity {
	type: 'alter_column_change_identity';
	column: Column;
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
	cause: View | null;
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
	view: View;
}

export type JsonStatement =
	| JsonCreateTable
	| JsonDropTable
	| JsonRenameTable
	| JsonRenameColumn
	| JsonAlterColumn
	| JsonRecreateColumn
	| JsonMoveView
	| JsonAlterView
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
	| JsonRenameIndex
	| JsonAddPrimaryKey
	| JsonDropPrimaryKey
	| JsonRenameConstraint
	| JsonAlterPrimaryKey
	| JsonCreateFK
	| JsonDropFK
	| JsonRecreateFK
	| JsonCreateUnique
	| JsonDeleteUnique
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
	| JsonRecreatePolicy
	| JsonRenamePolicy
	| JsonAlterRLS
	| JsonRenameRole
	| JsonCreateRole
	| JsonDropRole
	| JsonAlterRole
	| JsonGrantPrivilege
	| JsonRevokePrivilege
	| JsonRegrantPrivilege
	| JsonCreateView
	| JsonDropView
	| JsonRenameView
	| JsonAlterCheck
	| JsonDropValueFromEnum
	| JsonRecreateIndex;

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
