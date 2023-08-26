import type { ColumnBuilderBaseConfig, ColumnDataType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/index.ts';
import { PgColumnBuilder } from './common.ts';

export abstract class PgDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends PgColumnBuilder<T, TRuntimeConfig> {
	static readonly [entityKind]: string = 'PgDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}
}
