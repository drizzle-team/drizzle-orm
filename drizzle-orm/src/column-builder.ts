import { entityKind } from '~/entity.ts';
import type { Column, ColumnBaseConfig } from './column.ts';
import type { GelColumn, GelExtraConfigColumn } from './gel-core/index.ts';
import type { MySqlColumn } from './mysql-core/index.ts';
import type { ExtraConfigColumn, PgColumn, PgSequenceOptions } from './pg-core/index.ts';
import type { SingleStoreColumn } from './singlestore-core/index.ts';
import type { SQL } from './sql/sql.ts';
import type { SQLiteColumn } from './sqlite-core/index.ts';

export type ColumnDataType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'array'
	| 'json'
	| 'date'
	| 'bigint'
	| 'custom'
	| 'buffer'
	| 'dateDuration'
	| 'duration'
	| 'relDuration'
	| 'localTime'
	| 'localDate'
	| 'localDateTime';

export type Dialect = 'pg' | 'mysql' | 'sqlite' | 'singlestore' | 'common' | 'gel';

export type GeneratedStorageMode = 'virtual' | 'stored';

export type GeneratedType = 'always' | 'byDefault';

export interface GeneratedColumnConfig<TDataType> {
	as: TDataType | SQL | (() => SQL);
	type?: GeneratedType;
	mode?: GeneratedStorageMode;
}

export interface GeneratedIdentityConfig {
	sequenceName?: string;
	sequenceOptions?: PgSequenceOptions;
	type: 'always' | 'byDefault';
}

export interface ColumnBuilderBaseConfig<TDataType extends ColumnDataType> {
	name: string;
	dataType: TDataType;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
	notNull?: boolean;
	hasDefault?: boolean;
}

export type MakeColumnConfig<
	T extends ColumnBuilderBaseConfig<ColumnDataType>,
	TTableName extends string,
	TKey extends string,
	TData = T extends { $type: infer U } ? U : T['data'],
> = {
	name: T['name'] extends '' ? TKey : T['name'];
	tableName: TTableName;
	dataType: T['dataType'];
	data: TData;
	driverParam: T['driverParam'];
	notNull: T["notNull"] extends true ? true : false;
	hasDefault: T["hasDefault"] extends true ? true : false;
	isPrimaryKey: T extends { isPrimaryKey: true } ? true : false;
	isAutoincrement: T extends { isAutoincrement: true } ? true : false;
	hasRuntimeDefault: T extends { hasRuntimeDefault: true } ? true : false;
	enumValues: T['enumValues'];
	baseColumn: T extends { baseBuilder: infer U extends ColumnBuilderBase }
		? BuildColumn<TTableName, U, 'common', T['name'] extends '' ? TKey : T['name']>
		: never;
	identity: T extends { identity: 'always' } ? 'always' : T extends { identity: 'byDefault' } ? 'byDefault' : undefined;
	generated: T extends { generated: infer G } ? unknown extends G ? undefined
		: G extends undefined ? undefined
		: G
		: undefined;
} & {};

export interface ColumnBuilderRuntimeConfig<TData> {
	name: string;
	keyAsName: boolean;
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
	generatedIdentity: GeneratedIdentityConfig | undefined;
}

export interface ColumnBuilderExtraConfig {
	primaryKeyHasDefault?: boolean;
}

export type NotNull<T> = T & {
	_: {
		notNull: true;
	};
};

export type HasDefault<T> = T & {
	_: {
		hasDefault: true;
	};
};

export type IsPrimaryKey<T> = T & {
	_: {
		isPrimaryKey: true;
		notNull: true;
	};
};

export type IsAutoincrement<T> = T & {
	_: {
		isAutoincrement: true;
	};
};

export type HasRuntimeDefault<T> = T & {
	_: {
		hasRuntimeDefault: true;
	};
};

export type $Type<T, TType> = T & {
	_: {
		$type: TType;
	};
};

export type HasGenerated<T, TGenerated> = T & {
	_: {
		hasDefault: true;
		generated: TGenerated;
	};
};

export type IsIdentity<T, TType extends 'always' | 'byDefault'> = T & {
	_: {
		notNull: true;
		hasDefault: true;
		identity: TType;
	};
};

export interface ColumnBuilderBase<
	T extends ColumnBuilderBaseConfig<ColumnDataType> = ColumnBuilderBaseConfig<ColumnDataType>,
> {
	// TODO: @Sukairo-02, it is now accessed only in that file
	_: T;
}

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType>,
	TRuntimeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> implements ColumnBuilderBase<T> {
	static readonly [entityKind]: string = 'ColumnBuilder';

	// TODO: @Sukairo-02, it is now accessed only in that file
	declare _: T;

	/** @internal */
	protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

	constructor(name: string, dataType: ColumnDataType, columnType: string) {
		this.config = {
			name,
			keyAsName: name === '',
			notNull: false,
			default: undefined,
			hasDefault: false,
			primaryKey: false,
			isUnique: false,
			uniqueName: undefined,
			uniqueType: undefined,
			dataType,
			columnType,
			generated: undefined,
		} as ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig; // TODO: ??
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
	): HasRuntimeDefault<HasDefault<this>> {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this as HasRuntimeDefault<HasDefault<this>>;
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
	 * Alias for {@link $onUpdateFn}.
	 */
	$onUpdate = this.$onUpdateFn;

	/**
	 * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
	 *
	 * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
	 */
	primaryKey(): TExtraConfig['primaryKeyHasDefault'] extends true ? IsPrimaryKey<HasDefault<this>>
		: IsPrimaryKey<this>
	{
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as TExtraConfig['primaryKeyHasDefault'] extends true ? IsPrimaryKey<HasDefault<this>>
			: IsPrimaryKey<this>;
	}

	abstract generatedAlwaysAs(
		as: SQL | T['data'] | (() => SQL),
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, {
		type: 'always';
	}>;

	/** @internal Sets the name of the column to the key within the table definition if a name was not given. */
	setName(name: string) {
		if (this.config.name !== '') return;
		this.config.name = name;
	}
}

export type BuildColumn<
	TTableName extends string,
	TBuilder extends ColumnBuilderBase,
	TDialect extends Dialect,
	TKey extends string,
	TMakedConfig extends ColumnBaseConfig<ColumnDataType> = MakeColumnConfig<TBuilder['_'], TTableName, TKey>,
> = TDialect extends 'pg' ? PgColumn<TMakedConfig, {}>
	: TDialect extends 'mysql' ? MySqlColumn<TMakedConfig, {}>
	: TDialect extends 'sqlite' ? SQLiteColumn<TMakedConfig, {}>
	: TDialect extends 'common' ? Column<TMakedConfig, {}>
	: TDialect extends 'singlestore' ? SingleStoreColumn<TMakedConfig, {}>
	: TDialect extends 'gel' ? GelColumn<TMakedConfig, {}>
	: never;

export type BuildIndexColumn<
	TDialect extends Dialect,
> = TDialect extends 'pg' ? ExtraConfigColumn
	: TDialect extends 'gel' ? GelExtraConfigColumn
	: never;

// TODO
// try to make sql as well + indexRaw

// optional after everything will be working as expected
// also try to leave only needed methods for extraConfig
// make an error if I pass .asc() to fk and so on

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilderBase>,
	TDialect extends Dialect,
> =
	& {
		[Key in keyof TConfigMap]: BuildColumn<
			TTableName,
			TConfigMap[Key],
			TDialect,
			Key & string
		>;
	}
	& {};

export type BuildExtraConfigColumns<
	_TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilderBase>,
	TDialect extends Dialect,
> =
	& {
		[Key in keyof TConfigMap]: BuildIndexColumn<TDialect>;
	}
	& {};

export type ChangeColumnTableName<
	TColumn extends Column,
	TAlias extends string,
	TDialect extends Dialect,
	TKey extends string,
> = TDialect extends 'pg' ? PgColumn<MakeColumnConfig<TColumn['_'], TAlias, TKey>>
	: TDialect extends 'mysql' ? MySqlColumn<MakeColumnConfig<TColumn['_'], TAlias, TKey>>
	: TDialect extends 'singlestore' ? SingleStoreColumn<MakeColumnConfig<TColumn['_'], TAlias, TKey>>
	: TDialect extends 'sqlite' ? SQLiteColumn<MakeColumnConfig<TColumn['_'], TAlias, TKey>>
	: TDialect extends 'gel' ? GelColumn<MakeColumnConfig<TColumn['_'], TAlias, TKey>>
	: never;
