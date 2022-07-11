import { Table, table } from 'drizzle-orm/table';

import { AnyColumn } from '.';
import { PgColumnBuilder } from './columns/common';

export class PgTable<
	TName extends string,
	TColumns extends Record<string, AnyColumn>,
> extends Table<TName, TColumns> {}

export type AnyPgTable<TName extends string = string> = PgTable<TName, Record<string, AnyColumn>>;

export function pgTable<
	TTableName extends string,
	TConfigMap extends Record<string, PgColumnBuilder>,
>(name: TTableName, columns: TConfigMap) {
	return table(name, columns);
}
