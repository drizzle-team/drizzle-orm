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

export const dateToTimestampText = (value: Date): string => {
	const iso = value.toISOString();
	const first = iso.charCodeAt(0);
	// `+`: year > 9999
	if (first === 43) return iso.replace(/^\+0*/, '');
	// `-` or `0000`: year < 1 - astronomical year `y` is `1 - y` BC
	if (first === 45 || iso.startsWith('0000')) {
		return `${String(1 - value.getUTCFullYear()).padStart(4, '0')}${iso.slice(iso.indexOf('-', 1))} BC`;
	}
	return iso;
};
