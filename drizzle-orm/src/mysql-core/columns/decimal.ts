import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlDecimalBuilderInitial<TName extends string> = MySqlDecimalBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlDecimal';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'MySqlDecimal'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDecimalConfig> {
	static readonly [entityKind]: string = 'MySqlDecimalBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'MySqlDecimal');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDecimal<T extends ColumnBaseConfig<'number', 'MySqlDecimal'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDecimalConfig>
{
	static readonly [entityKind]: string = 'MySqlDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export interface MySqlDecimalConfig {
	precision?: number;
	scale?: number;
}

export function decimal<TName extends string>(
	name: TName,
	config: MySqlDecimalConfig = {},
): MySqlDecimalBuilderInitial<TName> {
	return new MySqlDecimalBuilder(name, config.precision, config.scale);
}
