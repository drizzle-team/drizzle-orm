import { SQL } from './sql';
import { Update } from './utils';

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

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<T extends Partial<ColumnBuilderBaseConfig>> {
	declare protected $brand: {
		type: 'ColumnBuilder';
		subtype: string;
	};
	declare protected $config: T;
	declare protected $data: T['data'];
	declare protected $driverParam: T['driverParam'];
	declare protected $notNull: T['notNull'];
	declare protected $hasDefault: T['hasDefault'];

	/** @internal */
	config: {
		name: string;
		notNull: boolean;
		default: T['data'] | SQL | undefined;
		primaryKey: boolean;
	};

	constructor(name: string) {
		this.config = {
			name,
			notNull: false,
			default: undefined,
			primaryKey: false,
		};
	}

	notNull(): ColumnBuilder<UpdateCBConfig<T, { notNull: true }>> {
		this.config.notNull = true;
		return this as ReturnType<this['notNull']>;
	}

	default(
		value: T['data'] | SQL,
	): ColumnBuilder<UpdateCBConfig<T, { hasDefault: true }>> {
		this.config.default = value;
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
> = Update<T, TUpdate>;
