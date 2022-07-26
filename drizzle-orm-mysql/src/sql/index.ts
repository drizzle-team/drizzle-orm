import { TableName } from 'drizzle-orm/branded-types';
import { PreparedQuery, SQL } from 'drizzle-orm/sql';
import { MySqlColumnDriverParam } from '~/branded-types';

export type MySQL<TTableName extends TableName> = SQL<
	TTableName
>;

export type AnyMySQL<TTableName extends TableName = TableName> = MySQL<TTableName>;

export interface MySqlPreparedQuery extends PreparedQuery<MySqlColumnDriverParam> {}
