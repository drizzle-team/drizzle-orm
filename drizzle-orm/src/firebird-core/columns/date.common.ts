import type { ColumnBuilderBaseConfig, ColumnDataType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { FirebirdColumnBuilder } from './common.ts';

export abstract class FirebirdDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends FirebirdColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'FirebirdDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`current_timestamp`);
	}
}
