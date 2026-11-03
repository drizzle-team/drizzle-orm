import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { CockroachColumnBuilderConfig } from './common.ts';
import { CockroachColumnBuilder } from './common.ts';

export abstract class CockroachDateColumnBaseBuilder<
	out T extends CockroachColumnBuilderConfig = CockroachColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> extends CockroachColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachDateColumnBaseBuilder';

	defaultNow() {
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
