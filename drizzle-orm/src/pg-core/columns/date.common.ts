import type { ColumnBuilderBaseConfig, ColumnDataType } from '~/column-builder';
import { entityKind } from '~/entity';
import { sql } from '~/sql';
import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends PgColumnBuilder<T, TRuntimeConfig> {
	static readonly [entityKind]: string = 'PgDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}
}
