import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, ColumnType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { MsSqlColumnBuilder } from './common.ts';

export abstract class MsSqlDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MsSqlColumnBuilder<T, TRuntimeConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateColumnBuilder';

	defaultGetDate() {
		return this.default(sql`(getdate())`);
	}
}

export type DatetimePrecision = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MsSqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: DatetimePrecision;
}
