import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithAutoIncrement, MsSqlColumnWithAutoIncrement } from './common.ts';

export type MsSqlDecimalBuilderInitial<TName extends string> = MsSqlDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MsSqlDecimal'>,
> extends MsSqlColumnBuilderWithAutoIncrement<T, MsSqlDecimalConfig> {
	static readonly [entityKind]: string = 'MsSqlDecimalBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'MsSqlDecimal');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDecimal<T extends ColumnBaseConfig<'string', 'MsSqlDecimal'>>
	extends MsSqlColumnWithAutoIncrement<T, MsSqlDecimalConfig>
{
	static readonly [entityKind]: string = 'MsSqlDecimal';

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

export interface MsSqlDecimalConfig {
	precision?: number;
	scale?: number;
}

export function decimal<TName extends string>(
	name: TName,
	config: MsSqlDecimalConfig = {},
): MsSqlDecimalBuilderInitial<TName> {
	return new MsSqlDecimalBuilder(name, config.precision, config.scale);
}
