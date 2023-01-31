import { ColumnBuilderBaseConfig, UpdateCBConfig } from '~/column-builder';
import { SQL, sql } from '~/sql';

import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig,
	TConfig extends Record<string, unknown> = {},
> extends PgColumnBuilder<T, TConfig> {
	override notNull(): PgDateColumnBaseBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(
		value: T['data'] | SQL,
	): PgDateColumnBaseBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): PgDateColumnBaseBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	defaultNow() {
		return this.default(sql`now()`);
	}
}
