import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	IsAutoincrement,
	IsPrimaryKey,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlSerialBuilderInitial<TName extends string> = IsAutoincrement<
	IsPrimaryKey<
		NotNull<
			HasDefault<
				GoogleSqlSerialBuilder<{
					name: TName;
					dataType: 'number';
					columnType: 'GoogleSqlSerial';
					data: number;
					driverParam: number;
					enumValues: undefined;
				}>
			>
		>
	>
>;

export class GoogleSqlSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlSerial'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GoogleSqlSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlSerial<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlSerial<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlSerial<
	T extends ColumnBaseConfig<'number', 'GoogleSqlSerial'>,
> extends GoogleSqlColumnWithAutoIncrement<T> {
	static override readonly [entityKind]: string = 'GoogleSqlSerial';

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

export function serial(): GoogleSqlSerialBuilderInitial<''>;
export function serial<TName extends string>(name: TName): GoogleSqlSerialBuilderInitial<TName>;
export function serial(name?: string) {
	return new GoogleSqlSerialBuilder(name ?? '');
}
