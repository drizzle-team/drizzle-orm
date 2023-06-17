import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlRealBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlRealBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlRealHKT;
}

export interface MySqlRealHKT extends ColumnHKTBase {
	_type: MySqlReal<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlRealBuilderInitial<TName extends string> = MySqlRealBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlRealBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilderWithAutoIncrement<
	MySqlRealBuilderHKT,
	T,
	MySqlRealConfig
> {
	static readonly [entityKind]: string = 'MySqlRealBuilder';

	constructor(name: T['name'], config: MySqlRealConfig | undefined) {
		super(name);
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlReal<MakeColumnConfig<T, TTableName>> {
		return new MySqlReal<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlReal<T extends ColumnBaseConfig> extends MySqlColumnWithAutoIncrement<
	MySqlRealHKT,
	T,
	MySqlRealConfig
> {
	static readonly [entityKind]: string = 'MySqlReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface MySqlRealConfig {
	precision?: number;
	scale?: number;
}

export function real<TName extends string>(name: TName, config: MySqlRealConfig = {}): MySqlRealBuilderInitial<TName> {
	return new MySqlRealBuilder(name, config);
}
