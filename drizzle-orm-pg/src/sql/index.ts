import { SQL } from 'drizzle-orm/sql';

import { PgDriverParam } from '../connection';

export type PgSQL<TTableName extends string, TDriverParams> = SQL<
	TTableName,
	PgDriverParam & TDriverParams
>;

export type AnyPgSQL<TTableName extends string = string> = PgSQL<TTableName, PgDriverParam>;
