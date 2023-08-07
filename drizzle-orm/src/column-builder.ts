import { entityKind } from '~/entity';
import type { Column } from './column';
import type { MySqlColumn } from './mysql-core';
import type { PgColumn } from './pg-core';
import type { SQL } from './sql';
import type { SQLiteColumn } from './sqlite-core';

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

export type Dialect = 'pg' | 'mysql' | 'sqlite' | 'common';

export interface ColumnBuilderBaseConfig<TDataType extends ColumnDataType, TColumnType extends string> {
	name: string;
	dataType: TDataType;
	columnType: TColumnType;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
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
	baseColumn: T extends { baseBuilder: infer U extends ColumnBuilder } ? BuildColumn<TTableName, U, 'common'>
		: never;
} & {};

export type ColumnBuilderTypeConfig<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTypeConfig extends object = object,
> =
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
	}
	& TTypeConfig;

export type ColumnBuilderRuntimeConfig<TData, TRuntimeConfig extends object = object> = {
	name: string;
	notNull: boolean;
	default: TData | SQL | undefined;
	hasDefault: boolean;
	primaryKey: boolean;
	isUnique: boolean;
	uniqueName: string | undefined;
	uniqueType: string | undefined;
	dataType: string;
	columnType: string;
} & TRuntimeConfig;

export interface ColumnBuilderExtraConfig {
	primaryKeyHasDefault?: boolean;
}

export type NotNull<T extends ColumnBuilder> = T & {
	_: {
		notNull: true;
	};
};

export type HasDefault<T extends ColumnBuilder> = T & {
	_: {
		hasDefault: true;
	};
};

export type $Type<T extends ColumnBuilder, TType> = T & {
	_: {
		$type: TType;
	};
};

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> {
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

	$type<TType>(): $Type<this, TType> {
		return this as $Type<this, TType>;
	}

	notNull(): NotNull<this> {
		this.config.notNull = true;
		return this as NotNull<this>;
	}

	default(value: (this['_'] extends { $type: infer U } ? U : T['data']) | SQL): HasDefault<this> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as HasDefault<this>;
	}

	primaryKey(): TExtraConfig['primaryKeyHasDefault'] extends true ? HasDefault<NotNull<this>> : NotNull<this> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as TExtraConfig['primaryKeyHasDefault'] extends true ? HasDefault<NotNull<this>> : NotNull<this>;
	}
}

export type BuildColumn<
	TTableName extends string,
	TBuilder extends ColumnBuilder,
	TDialect extends Dialect,
> = TDialect extends 'pg' ? PgColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'mysql' ? MySqlColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'sqlite' ? SQLiteColumn<MakeColumnConfig<TBuilder['_'], TTableName>>
	: TDialect extends 'common' ? Column<MakeColumnConfig<TBuilder['_'], TTableName>>
	: never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilder>,
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
		: never;
