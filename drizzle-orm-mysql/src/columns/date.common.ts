import { sql } from 'drizzle-orm';
import { ColumnBuilderBaseConfig, UpdateCBConfig } from 'drizzle-orm/column-builder';
import { SQL } from 'drizzle-orm/sql';

import { MySqlColumnBuilder } from './common';

export abstract class MySqlDateColumnBaseBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<T> {
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
		return this.default(sql`now()`);
	}

	onUpdateNow(): MySqlDateColumnBaseBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		this.hasOnUpdateNow = true;
		return this as ReturnType<this['onUpdateNow']>;
	}
}

// export abstract class MySqlDateBaseColumn<
// 	TTableName extends string,
// 	TData extends ColumnData,
// 	TDriverParam extends MySqlColumnDriverParam,
// 	TNotNull extends boolean,
// 	THasDefault extends boolean,
// > extends MySqlColumn<TTableName, TData, TDriverParam, TNotNull, THasDefault> {
// 	readonly hasOnUpdateNow: boolean;

// 	constructor(
// 		table: AnyMySqlTable<TTableName>,
// 		builder: MySqlDateColumnBaseBuilder<TData, TDriverParam, TNotNull, THasDefault>,
// 	) {
// 		super(table, builder);
// 		this.hasOnUpdateNow = builder.hasOnUpdateNow;
// 	}
// }
