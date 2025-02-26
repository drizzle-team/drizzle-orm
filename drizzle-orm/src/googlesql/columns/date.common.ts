import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnDataType,
	HasDefault,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export interface GoogleSqlDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
}

export abstract class GoogleSqlDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends GoogleSqlColumnBuilder<T, TRuntimeConfig & GoogleSqlDateColumnBaseConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlDateColumnBuilder';

	defaultNow() {
		return this.default(sql`(now())`);
	}

	// "on update now" also adds an implicit default value to the column - https://dev.mysql.com/doc/refman/8.0/en/timestamp-initialization.html
	onUpdateNow(): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class GoogleSqlDateBaseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends GoogleSqlColumn<T, GoogleSqlDateColumnBaseConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
