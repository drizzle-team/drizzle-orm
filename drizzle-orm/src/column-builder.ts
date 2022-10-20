import { SQL } from './sql';
import { RequiredKeys } from './utils';

export interface ColumnBuilderBaseConfig {
	data: unknown;
	driverParam: unknown;
	notNull: boolean;
	hasDefault: boolean;
}

export type ColumnBuilderConfig<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = UpdateColumnBuilderConfig<
	ColumnBuilderBaseConfig & {
		notNull: false;
		hasDefault: false;
	},
	TPartial
>;

export type UpdateColumnBuilderConfig<
	T extends ColumnBuilderBaseConfig,
	TUpdate extends Partial<ColumnBuilderBaseConfig>,
> = {} extends TUpdate ? T : RequiredKeys<Omit<T, keyof TUpdate> & Pick<TUpdate, keyof ColumnBuilderBaseConfig>>;

// To understand how to use `ColumnBuilder` and `AnyColumnBuilder`, see `Column` and `AnyColumn` documentation.
export abstract class ColumnBuilder<T extends ColumnBuilderBaseConfig> {
	declare protected $config: T;
	declare protected $brand: {
		type: 'ColumnBuilder';
		subtype: string;
	};

	/** @internal */
	config: {
		name: string;
		notNull: T['notNull'];
		default: T['data'] | SQL | undefined;
		primaryKey: boolean;
	};

	constructor(name: string) {
		this.config = {
			name,
			notNull: false as T['notNull'],
			default: undefined,
			primaryKey: false,
		};
	}

	notNull(): ColumnBuilder<UpdateColumnBuilderConfig<T, { notNull: true }>> {
		this.config.notNull = true as T['notNull'];
		return this as ReturnType<this['notNull']>;
	}

	default(
		value: T['data'] | SQL,
	): ColumnBuilder<UpdateColumnBuilderConfig<T, { hasDefault: true }>> {
		this.config.default = value;
		return this as ReturnType<this['default']>;
	}

	primaryKey(): ColumnBuilder<UpdateColumnBuilderConfig<T, { notNull: true }>> {
		this.config.primaryKey = true;
		return this as ReturnType<this['primaryKey']>;
	}
}

export type AnyColumnBuilder<TPartial extends Partial<ColumnBuilderBaseConfig> = {}> = ColumnBuilder<
	UpdateColumnBuilderConfig<ColumnBuilderBaseConfig, TPartial>
>;
