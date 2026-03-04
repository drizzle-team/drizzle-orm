import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { PgColumnBuilderConfig, SetHasDefault } from './common.ts';
import { PgColumnBuilder } from './common.ts';

export abstract class PgDateColumnBuilder<
	out T extends PgColumnBuilderConfig = PgColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> extends PgColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgDateColumnBaseBuilder';

	/**
	 * Adds a `default now()` clause to the column definition.
	 * Available for date/time column types.
	 */
	defaultNow(): SetHasDefault<this> {
		return this.default(sql`now()`);
	}
}
