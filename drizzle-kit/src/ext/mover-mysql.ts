export {
	type CheckConstraint,
	type Column,
	createDDL,
	type ForeignKey,
	type Index,
	type InterimColumn,
	type MysqlDDL,
	type PrimaryKey,
	type Table,
	type View,
} from '../dialects/mysql/ddl';

import { ddlDiffDry as ddd } from '../dialects/mysql/diff';
import { fromDatabase as fd } from '../dialects/mysql/introspect';

export const ddlDiffDry = ddd;
export const fromDatabase = fd;
