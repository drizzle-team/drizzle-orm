import type { ColumnBuilderBaseConfig, ColumnDataType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachDbColumnWithArrayBuilder } from './common.ts';

export abstract class CockroachDbDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends CockroachDbColumnWithArrayBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachDbDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}
}
