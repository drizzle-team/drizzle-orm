import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnDataType,
	HasDefault,
} from '~/column-builder.ts';
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
		return this.default(sql`(now())`);
	}

	// "on update now" also adds an implicit default value to the column - https://dev.mssql.com/doc/refman/8.0/en/timestamp-initialization.html
	onUpdateNow(): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class MsSqlDateBaseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends MsSqlColumn<T, MsSqlDateColumnBaseConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'MsSqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
