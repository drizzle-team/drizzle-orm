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
