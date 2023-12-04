import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, ColumnDataType } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export interface MsSqlDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
}

export abstract class MsSqlDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MsSqlColumnBuilder<T, TRuntimeConfig & MsSqlDateColumnBaseConfig, TExtraConfig> {
	static readonly [entityKind]: string = 'MsSqlDateColumnBuilder';

	defaultNow() {
		return this.default(sql`CURRENT_TIMESTAMP`);
	}
}

export abstract class MsSqlDateBaseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends MsSqlColumn<T, MsSqlDateColumnBaseConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'MsSqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
