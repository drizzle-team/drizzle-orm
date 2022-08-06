import { sql } from 'drizzle-orm';
import { ColumnData, ColumnHasDefault, ColumnNotNull, Unwrap } from 'drizzle-orm/branded-types';

import { PgColumnDriverParam } from '~/branded-types';
import { AnyPgSQL } from '~/sql';
import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<
	TData extends ColumnData,
	TDriverParam extends PgColumnDriverParam,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumnBuilder<TData, TDriverParam, TNotNull, THasDefault> {
	override notNull(): PgDateColumnBaseBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.notNull() as any;
	}

	override default(
		value: Unwrap<TData> | AnyPgSQL,
	): PgDateColumnBaseBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		return super.default(value) as any;
	}

	override primaryKey(): PgDateColumnBaseBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		return super.primaryKey() as any;
	}

	defaultNow() {
		return this.default(sql`now()`);
	}
}
