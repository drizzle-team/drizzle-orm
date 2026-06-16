import type { Column } from './column.ts';
import { entityKind } from './entity.ts';
import type { PrimaryKeyConfig } from './primary-keys.ts';
import type { SQL } from './sql/sql.ts';

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

export interface ColumnBuilderBaseConfig<TDataType extends ColumnDataType, TColumnType extends string> {
	name: string;
	dataType: TDataType;
	columnType: TColumnType;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
	generated?: {
		as: SQL;
		mode?: 'virtual' | 'stored';
	};
}

export type ColumnBuilderTypeConfig<T extends ColumnBuilderBaseConfig<ColumnDataType, string>, TTypeConfig extends object = object> =
	& T
	& TTypeConfig;

export type MakeColumnConfig<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TTableName extends string,
> = T & { tableName: TTableName };

export interface ColumnBuilderExtraConfig {
	primaryKeyHasDefault?: boolean;
}

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
	generated: {
		as: SQL;
		type: 'always' | 'byDefault';
		mode: 'virtual' | 'stored';
	} | undefined;
} & TRuntimeConfig;

export abstract class ColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> {
	static readonly [entityKind]: string = 'ColumnBuilder';

	declare _: {
		brand: 'ColumnBuilder';
		config: T;
		$type: TTypeConfig;
		columnBuilderBrand: 'ColumnBuilderBrand';
	};

	/**
	 * @internal
	 */
	config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>;

	constructor(name: T['name'], dataType: T['dataType'], columnType: T['columnType']) {
		this.config = {
			name,
			notNull: false,
			default: undefined,
			defaultFn: undefined,
			onUpdateFn: undefined,
			hasDefault: false,
			primaryKey: false,
			isUnique: false,
			uniqueName: undefined,
			uniqueType: undefined,
			dataType,
			columnType,
			generated: undefined,
		} as ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>;
	}

	$type<TType extends T['data']>(): ColumnBuilder<
		Omit<T, 'data' | 'driverParam'> & { data: TType; driverParam: T['driverParam'] },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		return this as any;
	}

	notNull(): ColumnBuilder<
		Omit<T, 'notNull'> & { notNull: true },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.notNull = true;
		return this as any;
	}

	default(
		value: (T['data'] | SQL),
	): ColumnBuilder<
		Omit<T, 'hasDefault'> & { hasDefault: true },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as any;
	}

	defaultRandom(): ColumnBuilder<
		Omit<T, 'hasDefault'> & { hasDefault: true },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.defaultFn = () => sql`(random())`;
		this.config.hasDefault = true;
		return this as any;
	}

	$defaultFn(
		fn: () => T['data'] | SQL,
	): ColumnBuilder<
		Omit<T, 'hasDefault'> & { hasDefault: true },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this as any;
	}

	$default = this.$defaultFn;

	$onUpdateFn(
		fn: () => T['data'] | SQL,
	): ColumnBuilder<
		Omit<T, 'hasDefault'> & { hasDefault: true },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.onUpdateFn = fn;
		this.config.hasDefault = true;
		return this as any;
	}

	$onUpdate = this.$onUpdateFn;

	primaryKey(
		config?: PrimaryKeyConfig,
	): ColumnBuilder<
		Omit<T, 'hasDefault'> & { hasDefault: TExtraConfig['primaryKeyHasDefault'] extends true ? true : false },
		TRuntimeConfig,
		TTypeConfig,
		TExtraConfig
	> {
		this.config.primaryKey = true;
		this.config.hasDefault = (config?.autoIncrement) as any;
		return this as any;
	}
}

// Workaround for https://github.com/microsoft/TypeScript/issues/29511
export type AnyColumnBuilder = ColumnBuilder<ColumnBuilderBaseConfig<ColumnDataType, string>>;

import { sql } from './sql/sql.ts';
