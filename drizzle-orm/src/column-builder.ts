import { entityKind } from '~/entity.ts';
import type { Column } from './column.ts';
import type { MsSqlColumn } from './mssql-core/index.ts';
import type { MySqlColumn } from './mysql-core/index.ts';
import type { PgColumn } from './pg-core/index.ts';
import type { SQL } from './sql/sql.ts';
import type { SQLiteColumn } from './sqlite-core/index.ts';
import type { Simplify } from './utils.ts';

export type ColumnDataType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'array'
	| 'json'
	| 'date'
	| 'bigint'
	| 'custom'
	| 'buffer';

export type Dialect = 'pg' | 'mysql' | 'sqlite' | 'common' | 'mssql';

export type GeneratedStorageMode = 'virtual' | 'stored';

export type GeneratedType = 'always' | 'byDefault';

export type GeneratedColumnConfig<TDataType> = {
	as: TDataType | SQL;
	type?: GeneratedType;
	mode?: GeneratedStorageMode;
};

export interface ColumnBuilderBaseConfig<TDataType extends ColumnDataType, TColumnType extends string> {
	name: string;
	dataType: TDataType;
	columnType: TColumnType;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
	generated: GeneratedColumnConfig<unknown> | undefined;
}

export type MakeColumnConfig<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTableName extends string,
> = {
	name: T['name'];
	tableName: TTableName;
	dataType: T['dataType'];
	columnType: T['columnType'];
	data: T extends { $type: infer U } ? U : T['data'];
	driverParam: T['driverParam'];
	notNull: T extends { notNull: true } ? true : false;
	hasDefault: T extends { hasDefault: true } ? true : false;
	enumValues: T['enumValues'];
	baseColumn: T extends { baseBuilder: infer U extends ColumnBuilderBase } ? BuildColumn<TTableName, U, 'common'>
		: never;
	generated: T['generated'] extends object ? T['generated'] : undefined;
} & {};

export type ColumnBuilderTypeConfig<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> = Simplify<
	& {
		brand: 'ColumnBuilder';
		name: T['name'];
		dataType: T['dataType'];
		columnType: T['columnType'];
		data: T['data'];
		driverParam: T['driverParam'];
		notNull: T extends { notNull: infer U } ? U : boolean;
		hasDefault: T extends { hasDefault: infer U } ? U : boolean;
		enumValues: T['enumValues'];
		generated: GeneratedColumnConfig<T['data']> | undefined;
	}
	& TTypeConfig
>;

export type ColumnBuilderRuntimeConfig<TData, TRuntimeConfig extends object = object> = {
	name: string;
	notNull: boolean;
	default: TData | SQL | undefined;
	defaultFn: (() => TData | SQL) | undefined;
	onUpdateFn: (() => TData | SQL) | undefined;
	hasDefault: boolean;
	primaryKey: boolean;
	isUnique: boolean;
	uniqueName: string | undefined;
	uniqueType: string | undefined;
	dataType: string;
	columnType: string;
	generated: GeneratedColumnConfig<TData> | undefined;
} & TRuntimeConfig;

export interface ColumnBuilderExtraConfig {
	primaryKeyHasDefault?: boolean;
}

export type NotNull<T extends ColumnBuilderBase> = T & {
	_: {
		notNull: true;
	};
};

export type HasDefault<T extends ColumnBuilderBase> = T & {
	_: {
		hasDefault: true;
	};
};

export type $Type<T extends ColumnBuilderBase, TType> = T & {
	_: {
		$type: TType;
	};
};

export type HasGenerated<T extends ColumnBuilderBase, TGenerated = object> = T & {
	_: {
		notNull: true;
		hasDefault: true;
		generated: TGenerated;
	};
};

export interface ColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> {
	_: ColumnBuilderTypeConfig<T, TTypeConfig>;
}

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> implements ColumnBuilderBase<T, TTypeConfig> {
	static readonly [entityKind]: string = 'ColumnBuilder';

	declare _: ColumnBuilderTypeConfig<T, TTypeConfig>;

	protected config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>;

	constructor(name: T['name'], dataType: T['dataType'], columnType: T['columnType']) {
		this.config = {
			name,
			notNull: false,
			default: undefined,
			hasDefault: false,
			primaryKey: false,
			isUnique: false,
			uniqueName: undefined,
			uniqueType: undefined,
			dataType,
			columnType,
		} as ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>;
	}

	/**
	 * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
	 *
	 * @example
	 * ```ts
	 * const users = pgTable('users', {
	 * 	id: integer('id').$type<UserId>().primaryKey(),
	 * 	details: json('details').$type<UserDetails>().notNull(),
	 * });
	 * ```
	 */
	$type<TType>(): $Type<this, TType> {
		return this as $Type<this, TType>;
	}

	/**
	 * Adds a `not null` clause to the column definition.
	 *
	 * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
	 */
	notNull(): NotNull<this> {
		this.config.notNull = true;
		return this as NotNull<this>;
	}

	/**
	 * Adds a `default <value>` clause to the column definition.
	 *
	 * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
	 *
	 * If you need to set a dynamic default value, use {@link $defaultFn} instead.
	 */
	default(value: (this['_'] extends { $type: infer U } ? U : this['_']['data']) | SQL): HasDefault<this> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}

	/**
	 * Adds a dynamic default value to the column.
	 * The function will be called when the row is inserted, and the returned value will be used as the column value.
	 *
	 * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	 */
	$defaultFn(
		fn: () => (this['_'] extends { $type: infer U } ? U : this['_']['data']) | SQL,
	): HasDefault<this> {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}

	/**
	 * Alias for {@link $defaultFn}.
	 */
	$default = this.$defaultFn;

	/**
	 * Adds a dynamic update value to the column.
	 * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
	 * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
	 *
	 * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	 */
	$onUpdateFn(
		fn: () => (this['_'] extends { $type: infer U } ? U : this['_']['data']) | SQL,
	): HasDefault<this> {
		this.config.onUpdateFn = fn;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}

	/**
	 * Alias for {@link $defaultFn}.
	 */
	$onUpdate = this.$onUpdateFn;

	/**
	 * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
	 *
	 * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
	 */
	primaryKey(): TExtraConfig['primaryKeyHasDefault'] extends true ? HasDefault<NotNull<this>> : NotNull<this> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as TExtraConfig['primaryKeyHasDefault'] extends true ? HasDefault<NotNull<this>> : NotNull<this>;
	}
}

export type BuildColumn<
	TTableName extends string,
	TBuilder extends ColumnBuilderBase,
	TDialect extends Dialect,
> = TDialect extends 'pg' ? PgColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'mysql' ? MySqlColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'sqlite' ? SQLiteColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'mssql' ? MsSqlColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'common' ? Column<MakeColumnConfig<TBuilder['_'], TTableName>>
	: never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilderBase>,
	TDialect extends Dialect,
> =
	& {
		[Key in keyof TConfigMap]: BuildColumn<TTableName, TConfigMap[Key], TDialect>;
	}
	& {};

export type ChangeColumnTableName<TColumn extends Column, TAlias extends string, TDialect extends Dialect> =
	TDialect extends 'pg' ? PgColumn<MakeColumnConfig<TColumn['_'], TAlias>>
		: TDialect extends 'mysql' ? MySqlColumn<MakeColumnConfig<TColumn['_'], TAlias>>
		: TDialect extends 'sqlite' ? SQLiteColumn<MakeColumnConfig<TColumn['_'], TAlias>>
		: TDialect extends 'mssql' ? MsSqlColumn<MakeColumnConfig<TColumn['_'], TAlias>>
		: never;
