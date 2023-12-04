import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithAutoIncrement, MsSqlColumnWithAutoIncrement } from './common.ts';

export type MsSqlDoubleBuilderInitial<TName extends string> = MsSqlDoubleBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlDouble';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlDouble'>>
	extends MsSqlColumnBuilderWithAutoIncrement<T, MsSqlDoubleConfig>
{
	static readonly [entityKind]: string = 'MsSqlDoubleBuilder';

	constructor(name: T['name'], config: MsSqlDoubleConfig | undefined) {
		super(name, 'number', 'MsSqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDouble<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDouble<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlDouble<T extends ColumnBaseConfig<'number', 'MsSqlDouble'>>
	extends MsSqlColumnWithAutoIncrement<T, MsSqlDoubleConfig>
{
	static readonly [entityKind]: string = 'MsSqlDouble';

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

export interface MsSqlDoubleConfig {
	precision?: number;
	scale?: number;
}

export function double<TName extends string>(
	name: TName,
	config?: MsSqlDoubleConfig,
): MsSqlDoubleBuilderInitial<TName> {
	return new MsSqlDoubleBuilder(name, config);
}
