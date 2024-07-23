import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnDataType,
	HasDefault,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export interface SingleStoreDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
}

export abstract class SingleStoreDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends SingleStoreColumnBuilder<T, TRuntimeConfig & SingleStoreDateColumnBaseConfig, TExtraConfig> {
	static readonly [entityKind]: string = 'SingleStoreDateColumnBuilder';

	defaultNow() {
		return this.default(sql`(now())`);
	}

	// "on update now" also adds an implicit default value to the column - https://dev.mysql.com/doc/refman/8.0/en/timestamp-initialization.html
	// TODO(singlestore)
	onUpdateNow(): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class SingleStoreDateBaseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends SingleStoreColumn<T, SingleStoreDateColumnBaseConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'SingleStoreDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
