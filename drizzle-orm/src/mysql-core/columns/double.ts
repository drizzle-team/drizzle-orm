import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlDoubleBuilderInitial<TName extends string> = MySqlDoubleBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MySqlDouble';
		data: number;
		driverParam: number | string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlDouble'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDoubleConfig>
{
	static readonly [entityKind]: string = 'MySqlDoubleBuilder';

	constructor(name: T['name'], config: MySqlDoubleConfig | undefined) {
		super(name, 'number', 'MySqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDouble<MakeColumnConfig<T, TTableName>> {
		return new MySqlDouble<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlDouble<T extends ColumnBaseConfig<'number', 'MySqlDouble'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDoubleConfig>
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
