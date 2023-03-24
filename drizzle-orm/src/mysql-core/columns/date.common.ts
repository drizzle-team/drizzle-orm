import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, UpdateCBConfig } from '~/column-builder';
import type { SQL} from '~/sql';
import { sql } from '~/sql';
import type { AnyMySqlTable } from '../table';

import { MySqlColumn, MySqlColumnBuilder } from './common';

export abstract class MySqlDateColumnBaseBuilder<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends MySqlColumnBuilder<T, TConfig & { hasOnUpdateNow: boolean }> {
	hasOnUpdateNow: boolean = false;

	override notNull(): MySqlDateColumnBaseBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.notNull() as ReturnType<this['notNull']>;
	}

	override default(
		value: T['data'] | SQL,
	): MySqlDateColumnBaseBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		return super.default(value) as ReturnType<this['default']>;
	}

	override primaryKey(): MySqlDateColumnBaseBuilder<UpdateCBConfig<T, { notNull: true }>> {
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	defaultNow() {
		return this.default(sql`(now())`);
	}

	onUpdateNow(): MySqlDateColumnBaseBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		this.config.hasOnUpdateNow = true;
		this.config.hasDefault = true;
		return this as ReturnType<this['onUpdateNow']>;
	}
}

export abstract class MySqlDateBaseColumn<T extends Partial<ColumnBaseConfig & { hasOnUpdateNow: boolean }>>
	extends MySqlColumn<T>
{
	declare protected $hasOnUpdateNow: T['hasOnUpdateNow'];

	readonly hasOnUpdateNow: boolean;

	constructor(
		override readonly table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateColumnBaseBuilder<Omit<T, 'tableName'>>['config'],
	) {
		super(table, config);
		this.hasOnUpdateNow = config.hasOnUpdateNow;
	}
}
