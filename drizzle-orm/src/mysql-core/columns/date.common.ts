import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, ColumnType, HasDefault } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';
import type { TimestampFsp } from './timestamp.ts';

export interface MySqlDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
	onUpdateNowFsp: TimestampFsp | undefined;
}

export abstract class MySqlDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MySqlColumnBuilder<T, TRuntimeConfig & MySqlDateColumnBaseConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'MySqlDateColumnBuilder';

	defaultNow() {
		return this.default(sql`(now())`);
	}

	// "on update now" also adds an implicit default value to the column - https://dev.mysql.com/doc/refman/8.0/en/timestamp-ization.html
	onUpdateNow(config?: { fsp: TimestampFsp }): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.onUpdateNowFsp = config?.fsp;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class MySqlDateBaseColumn<
	T extends ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends MySqlColumn<T, MySqlDateColumnBaseConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'MySqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
	readonly onUpdateNowFsp: TimestampFsp | undefined = this.config.onUpdateNowFsp;
}
