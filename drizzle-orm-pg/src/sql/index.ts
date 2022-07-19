import { SQL } from 'drizzle-orm/sql';

import { PgDriverParam } from '../connection';

export type PgSQL<TTableName extends string> = SQL<
	TTableName
>;

export type AnyPgSQL<TTableName extends string = string> = PgSQL<TTableName>;
