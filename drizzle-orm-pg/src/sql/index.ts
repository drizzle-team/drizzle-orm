import { TableName } from 'drizzle-orm/branded-types';
import { PreparedQuery, SQL } from 'drizzle-orm/sql';

import { PgColumnDriverParam } from '~/branded-types';

export type PgSQL<TTableName extends TableName> = SQL<
	TTableName
>;

export type AnyPgSQL<TTableName extends TableName = TableName> = PgSQL<TTableName>;

export interface PgPreparedQuery extends PreparedQuery<PgColumnDriverParam> {}
