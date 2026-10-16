import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { DSQLColumnBuilderConfig, SetHasDefault } from './common.ts';
import { DSQLColumnBuilder } from './common.ts';

export abstract class DSQLDateColumnBuilder<
	out T extends DSQLColumnBuilderConfig = DSQLColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> extends DSQLColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'DSQLDateColumnBaseBuilder';

	/**
	 * Adds `default now()` to the column definition.
	 * Available for date/time column types.
	 */
	defaultNow(): SetHasDefault<this> {
		return this.default(sql`now()`);
	}
}
