import { sql } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull } from 'drizzle-orm/branded-types';
import { PgColumnDriverParam } from '~/branded-types';
import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	defaultNow() {
		return this.default(sql`now()`);
	}
}
