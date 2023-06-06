import type { ColumnBaseConfig, ColumnHKT } from '~/column';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderHKTBase,
	ColumnBuilderKind,
	UpdateCBConfig,
} from '~/column-builder';
import { entityKind } from '~/entity';
import { sql } from '~/sql';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
}

export abstract class MySqlDateColumnBaseBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
> extends MySqlColumnBuilder<THKT, T, TRuntimeConfig & MySqlDateColumnBaseConfig> {
	static readonly [entityKind]: string = 'MySqlDateColumnBuilder';

	defaultNow() {
		return this.default(sql`(now())`);
	}

	// "on update now" also adds an implicit default value to the column - https://dev.mysql.com/doc/refman/8.0/en/timestamp-initialization.html
	onUpdateNow(): ColumnBuilderKind<THKT, UpdateCBConfig<T, { hasDefault: true }>> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this;
	}
}

export abstract class MySqlDateBaseColumn<
	THKT extends ColumnHKT,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
> extends MySqlColumn<THKT, T, MySqlDateColumnBaseConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'MySqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
