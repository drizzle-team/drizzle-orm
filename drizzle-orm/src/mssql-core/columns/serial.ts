import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithAutoIncrement, MsSqlColumnWithAutoIncrement } from './common.ts';

export type MsSqlSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		MsSqlSerialBuilder<{
			name: TName;
			dataType: 'number';
			columnType: 'MsSqlSerial';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class MsSqlSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlSerial'>>
	extends MsSqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MsSqlSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlSerial<MakeColumnConfig<T, TTableName>> {
		return new MsSqlSerial<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlSerial<
	T extends ColumnBaseConfig<'number', 'MsSqlSerial'>,
> extends MsSqlColumnWithAutoIncrement<T> {
	static readonly [entityKind]: string = 'MsSqlSerial';

	getSQLType(): string {
		return 'serial';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function serial<TName extends string>(name: TName): MsSqlSerialBuilderInitial<TName> {
	return new MsSqlSerialBuilder(name) as MsSqlSerialBuilderInitial<TName>;
}
