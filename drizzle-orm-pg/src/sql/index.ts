import { AnyColumn, AnyTable } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { PreparedQuery, SQL, SQLSourceParam } from 'drizzle-orm/sql';

import { PgColumnDriverParam } from '~/branded-types';
import { AnyPgColumn } from '~/columns/common';
import { AnyPgTable } from '~/table';

export type PgSQL<TTableName extends TableName> = SQL<
	TTableName
>;

export type AnyPgSQL<TTableName extends TableName = TableName> = PgSQL<TTableName>;

export interface PgPreparedQuery extends PreparedQuery<PgColumnDriverParam> {}
