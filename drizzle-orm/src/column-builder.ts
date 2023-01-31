import { SQL } from './sql';
import { Simplify, Update } from './utils';

export interface ColumnBuilderBaseConfig {
	data: unknown;
	driverParam: unknown;
	notNull: boolean;
	hasDefault: boolean;
}

export type ColumnBuilderConfig<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = Update<
	ColumnBuilderBaseConfig & {
		notNull: false;
		hasDefault: false;
	},
	TPartial
>;

export abstract class ColumnBuilderWithConfig<
	T extends Partial<ColumnBuilderBaseConfig>,
> {
	declare protected $config: T;
}

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<
	T extends Partial<ColumnBuilderBaseConfig>,
	TConfig extends Record<string, unknown> = {},
> extends ColumnBuilderWithConfig<T> {
	declare protected $brand: {
		type: 'ColumnBuilder';
		subtype: string;
	};
	declare protected $data: T['data'];
	declare protected $driverParam: T['driverParam'];
	declare protected $notNull: T['notNull'];
	declare protected $hasDefault: T['hasDefault'];

	protected config: {
		name: string;
		notNull: boolean;
		default: T['data'] | SQL | undefined;
		hasDefault: boolean;
		primaryKey: boolean;
	} & TConfig;

	constructor(name: string) {
		super();
		this.config = {
			name,
			notNull: false,
			default: undefined,
			primaryKey: false,
		} as ColumnBuilder<T, TConfig>['config'];
	}

	notNull(): ColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		this.config.notNull = true;
		return this as ReturnType<this['notNull']>;
	}

	default(
		value: T['data'] | SQL,
	): ColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as ReturnType<this['default']>;
	}

	primaryKey(): ColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as ReturnType<this['primaryKey']>;
	}
}

export type UpdateCBConfig<
	T extends Partial<ColumnBuilderBaseConfig>,
	TUpdate extends Partial<ColumnBuilderBaseConfig>,
> = Simplify<Pick<T, Exclude<keyof T, keyof TUpdate>> & TUpdate>;
