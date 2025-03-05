import type { ColumnBuilderBaseConfig, ColumnDataType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { GelColumnBuilder } from './common.ts';

export abstract class GelLocalDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends GelColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'GelLocalDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}
}
