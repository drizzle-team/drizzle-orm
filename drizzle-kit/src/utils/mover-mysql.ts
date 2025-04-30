export {
	type CheckConstraint,
	type Column,
	createDDL,
	type ForeignKey,
	type Index,
	type PrimaryKey,
	type Table,
	type View,
} from '../dialects/mysql/ddl';

export { ddlDiffDry } from '../dialects/mysql/diff';
