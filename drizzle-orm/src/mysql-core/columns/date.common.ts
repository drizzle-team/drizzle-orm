import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnDataType,
	HasDefault,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export interface MySqlDateColumnBaseConfig {
	hasOnUpdateNow: boolean;
  fsp: number | undefined;
}

export abstract class MySqlDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends MySqlColumnBuilder<T, TRuntimeConfig & MySqlDateColumnBaseConfig, TExtraConfig> {
	static readonly [entityKind]: string = 'MySqlDateColumnBuilder';

	/**
	 * @deprecated Use `defaultCurrentTimestamp()` instead.
	 *
	 * Adds `DEFAULT (now())` to the column
	 */
	defaultNow() {
		return this.default(sql`(now())`);
	}

  /**
  * Adds `DEFAULT CURRENT_TIMESTAMP` to the column
  * */
  defaultCurrentTimestamp() {
    const fsp = this.config.fsp ? `(${this.config.fsp})` : '';
    return this.default(sql.raw(`CURRENT_TIMESTAMP${fsp}`));
  }

	// "on update now" also adds an implicit default value to the column - https://dev.mysql.com/doc/refman/8.0/en/timestamp-initialization.html
	/**
	 * @deprecated Use `defaultCurrentTimestamp()` instead.
	 */
	onUpdateNow(): HasDefault<this> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}

  /**
  * Adds `ON UPDATE CURRENT_TIMESTAMP` to the column
  * */
  onUpdateCurrentTimestamp(): HasDefault<this> {
    this.config.hasOnUpdateNow = true;
    this.config.hasDefault = true;
    return this as HasDefault<this>;
  }
}

export abstract class MySqlDateBaseColumn<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends MySqlColumn<T, MySqlDateColumnBaseConfig & TRuntimeConfig> {
	static readonly [entityKind]: string = 'MySqlDateColumn';

	readonly hasOnUpdateNow: boolean = this.config.hasOnUpdateNow;
}
