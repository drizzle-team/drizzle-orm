export {
	type CheckConstraint,
	type Column,
	createDDL,
	type Enum,
	type ForeignKey,
	type Identity,
	type Index,
	type InterimSchema,
	type Policy,
	type PostgresDDL,
	type PostgresEntity,
	type PrimaryKey,
	type Role,
	type Schema,
	type Sequence,
	type UniqueConstraint,
	type View,
} from '../dialects/postgres/ddl';

import { ddlDiffDry as ddd } from '../dialects/postgres/diff';
import { fromDatabase as fd, fromDatabaseForDrizzle as fdfd } from '../dialects/postgres/introspect';

export const ddlDiffDry = ddd;
export const fromDatabase = fd;
export const fromDatabaseForDrizzle = fdfd;

import type { PostgresEntities } from '../dialects/postgres/ddl';
export type Table = PostgresEntities['tables'];
