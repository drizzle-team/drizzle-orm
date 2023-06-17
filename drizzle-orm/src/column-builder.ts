import { entityKind } from '~/entity';
import type { AnyColumn, ColumnHKTBase, ColumnKind } from './column';
import type { SQL } from './sql';
import { type Assume, type SimplifyShallow, type Update } from './utils';

export interface ColumnBuilderBaseConfig {
	name: string;
	data: unknown;
	driverParam: unknown;
	notNull: boolean;
	hasDefault: boolean;
}

export type ColumnBuilderConfig<
	TInitial extends Partial<ColumnBuilderBaseConfig> = {},
	TDefaults extends Partial<ColumnBuilderBaseConfig> = {},
> = SimplifyShallow<
	Required<
		Update<
			ColumnBuilderBaseConfig & {
				notNull: false;
				hasDefault: false;
			},
			& { [K in keyof TInitial]: TInitial[K] }
			& {
				[K in Exclude<keyof TDefaults, keyof TInitial> & string]: TDefaults[K];
			}
		>
	>
>;

export type MakeColumnConfig<T extends ColumnBuilderBaseConfig, TTableName extends string> = SimplifyShallow<
	Pick<T, keyof ColumnBuilderBaseConfig> & { tableName: TTableName }
>;

export interface ColumnBuilderHKTBase {
	config: unknown;
	_type: unknown;
	_columnHKT: unknown;
}

export type ColumnBuilderKind<
	THKT extends ColumnBuilderHKTBase,
	TConfig extends ColumnBuilderBaseConfig,
> = (THKT & {
	config: TConfig;
})['_type'];

export interface ColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: ColumnBuilder<ColumnBuilderHKT, Assume<this['config'], ColumnBuilderBaseConfig>>;
}

export interface ColumnBuilderRuntimeConfig<TData> {
	name: string;
	notNull: boolean;
	default: TData | SQL | undefined;
	hasDefault: boolean;
	primaryKey: boolean;
}

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> {
	static readonly [entityKind]: string = 'ColumnBuilder';

	declare _: {
		brand: 'ColumnBuilder';
		config: T;
		hkt: THKT;
		columnHKT: THKT['_columnHKT'];
		name: T['name'];
		data: T['data'];
		driverParam: T['driverParam'];
		notNull: T['notNull'];
		hasDefault: T['hasDefault'];
	} & TTypeConfig;

	protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

	constructor(name: T['name']) {
		this.config = {
			name,
			notNull: false,
			default: undefined,
			primaryKey: false,
		} as ColumnBuilder<THKT, T, TRuntimeConfig>['config'];
	}

	$type<TType extends T['data']>(): ColumnBuilderKind<THKT, Update<T, { data: TType }>> {
		return this as ColumnBuilderKind<THKT, Update<T, { data: TType }>>;
	}

	notNull(): ColumnBuilderKind<THKT, UpdateCBConfig<T, { notNull: true }>> {
		this.config.notNull = true;
		return this as ReturnType<this['notNull']>;
	}

	default(
		value: T['data'] | SQL,
	): ColumnBuilderKind<THKT, UpdateCBConfig<T, { hasDefault: true }>> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as ReturnType<this['default']>;
	}

	primaryKey(): ColumnBuilderKind<THKT, UpdateCBConfig<T, { notNull: true }>> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as ReturnType<this['primaryKey']>;
	}
}

export type AnyColumnBuilder = ColumnBuilder<ColumnBuilderHKT, ColumnBuilderBaseConfig>;

export type UpdateCBConfig<
	T extends ColumnBuilderBaseConfig,
	TUpdate extends Partial<ColumnBuilderBaseConfig>,
> = Update<T, TUpdate>;

export type BuildColumn<
	TTableName extends string,
	TBuilder extends AnyColumnBuilder,
> = Assume<
	ColumnKind<
		Assume<TBuilder['_']['columnHKT'], ColumnHKTBase>,
		SimplifyShallow<{ tableName: TTableName } & TBuilder['_']['config']>
	>,
	AnyColumn
>;

export type BuildColumns<TTableName extends string, TConfigMap extends Record<string, AnyColumnBuilder>> =
	SimplifyShallow<
		{
			[Key in keyof TConfigMap]: BuildColumn<TTableName, TConfigMap[Key]>;
		}
	>;

// export type ChangeColumnTableName<TColumn extends AnyColumn, TAlias extends string> = ColumnKind<
// 	TColumn['_']['hkt'],
// 	SimplifyShallow<Update<TColumn['_']['config'], { tableName: TAlias }>>
// >;

export type ChangeColumnTableName<TColumn extends AnyColumn, TAlias extends string> = ColumnKind<
	TColumn['_']['hkt'],
	SimplifyShallow<Update<TColumn['_']['config'], { tableName: TAlias }>>
>;
