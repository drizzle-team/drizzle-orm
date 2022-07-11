import { AnyColumn } from 'drizzle-orm';

import { AnyPgTable } from '.';

export function foreignKey<
	TColumns extends [AnyColumn, ...AnyColumn[]],
	TRefTableName extends string,
>(config: () => [columns: TColumns, table: AnyPgTable<TRefTableName>, refColumns: TColumns]) {
	return {};
}
