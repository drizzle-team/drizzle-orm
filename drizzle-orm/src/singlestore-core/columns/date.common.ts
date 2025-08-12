import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, ColumnType, HasDefault } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export interface SingleStoreDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
}

export abstract class SingleStoreDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends SingleStoreColumnBuilder<T, TRuntimeConfig & SingleStoreDateColumnBaseConfig, TExtraConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDateColumnBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}

	onUpdateNow(): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}
}

export abstract class SingleStoreDateBaseColumn<
	T extends ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends SingleStoreColumn<T, SingleStoreDateColumnBaseConfig & TRuntimeConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
