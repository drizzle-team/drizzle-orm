import { sql } from 'drizzle-orm';
import { ColumnBuilderBaseConfig, UpdateCBConfig } from 'drizzle-orm/column-builder';
import { SQL } from 'drizzle-orm/sql';

import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<T> {
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
