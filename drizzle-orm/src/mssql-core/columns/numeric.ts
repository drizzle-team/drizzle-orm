import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';
import type { MsSqlDecimalConfig as MsSqlNumericConfig } from './decimal.ts';

export type MsSqlNumericBuilderInitial<TName extends string> = MsSqlNumericBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlNumeric';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class MsSqlNumericBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'MsSqlNumeric'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlNumericConfig> {
	static readonly [entityKind]: string = 'MsSqlNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'MsSqlNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlNumeric<MakeColumnConfig<T, TTableName>> {
		return new MsSqlNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlNumeric<T extends ColumnBaseConfig<'number', 'MsSqlNumeric'>>
	extends MsSqlColumnWithIdentity<T, MsSqlNumericConfig>
{
	static readonly [entityKind]: string = 'MsSqlNumeric';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	_getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric<TName extends string>(
	name: TName,
	config: MsSqlNumericConfig = {},
): MsSqlNumericBuilderInitial<TName> {
	return new MsSqlNumericBuilder(name, config.precision, config.scale);
}
