import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlDoubleBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDoubleBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDoubleHKT;
}

export interface MySqlDoubleHKT extends ColumnHKTBase {
	_type: MySqlDouble<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDoubleBuilderInitial<TName extends string> = MySqlDoubleBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDoubleBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlDoubleBuilderHKT, T, MySqlDoubleConfig>
{
	static readonly [entityKind]: string = 'MySqlDoubleBuilder';

	constructor(name: T['name'], config: MySqlDoubleConfig | undefined) {
		super(name);
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDouble<MakeColumnConfig<T, TTableName>> {
		return new MySqlDouble<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDouble<T extends ColumnBaseConfig>
	extends MySqlColumnWithAutoIncrement<MySqlDoubleHKT, T, MySqlDoubleConfig>
{
	static readonly [entityKind]: string = 'MySqlDouble';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `double(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'double';
		} else {
			return `double(${this.precision})`;
		}
	}
}

export interface MySqlDoubleConfig {
	precision?: number;
	scale?: number;
}

export function double<TName extends string>(
	name: TName,
	config?: MySqlDoubleConfig,
): MySqlDoubleBuilderInitial<TName> {
	return new MySqlDoubleBuilder(name, config);
}
