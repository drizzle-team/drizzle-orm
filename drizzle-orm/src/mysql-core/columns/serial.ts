import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		MySqlSerialBuilder<
			{
				name: TName;
				dataType: 'number';
				columnType: 'MySqlSerial';
				data: number;
				driverParam: number;
				enumValues: undefined;
				generated: undefined;
			}
		>
	>
>;

export class MySqlSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlSerial'>>
	extends MySqlColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'MySqlSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlSerial<MakeColumnConfig<T, TTableName>> {
		return new MySqlSerial<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlSerial<
	T extends ColumnBaseConfig<'number', 'MySqlSerial'>,
> extends MySqlColumnWithAutoIncrement<T> {
	static readonly [entityKind]: string = 'MySqlSerial';

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

export function serial<TName extends string>(name: TName): MySqlSerialBuilderInitial<TName> {
	return new MySqlSerialBuilder(name) as MySqlSerialBuilderInitial<TName>;
}
