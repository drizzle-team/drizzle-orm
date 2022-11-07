import { TableName } from 'drizzle-orm/branded-types';
import { Query, SQL } from 'drizzle-orm/sql';
import { MySqlColumnDriverParam } from '~/branded-types';

export type MySQL<TTableName extends string> = SQL<TTableName>;

export type AnyMySQL = MySQL<string>;

export interface MySqlPreparedQuery extends Query<MySqlColumnDriverParam> {}
