import { AnyColumn, AnyTable } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { PreparedQuery, SQL, SQLSourceParam } from 'drizzle-orm/sql';

import { SQLiteColumnDriverParam } from '~/branded-types';
import { AnySQLiteColumn } from '~/columns/common';
import { AnySQLiteTable } from '~/table';

export type SQLiteSQL<TTableName extends TableName> = SQL<
	TTableName
>;

export type AnySQLiteSQL<TTableName extends TableName = TableName> = SQLiteSQL<TTableName>;

export interface SQLitePreparedQuery extends PreparedQuery<SQLiteColumnDriverParam> {}
