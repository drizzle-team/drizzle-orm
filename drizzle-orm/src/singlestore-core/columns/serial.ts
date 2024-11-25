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
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreSerialBuilderInitial<TName extends string> = IsAutoincrement<
	IsPrimaryKey<
		NotNull<
			HasDefault<
				SingleStoreSerialBuilder<{
					name: TName;
					dataType: 'number';
					columnType: 'SingleStoreSerial';
					data: number;
					driverParam: number;
					enumValues: undefined;
					generated: undefined;
				}>
			>
		>
	>
>;

export class SingleStoreSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreSerial'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T>
{
	static override readonly [entityKind]: string = 'SingleStoreSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SingleStoreSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreSerial<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreSerial<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreSerial<
	T extends ColumnBaseConfig<'number', 'SingleStoreSerial'>,
> extends SingleStoreColumnWithAutoIncrement<T> {
	static override readonly [entityKind]: string = 'SingleStoreSerial';

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

export function serial(): SingleStoreSerialBuilderInitial<''>;
export function serial<TName extends string>(name: TName): SingleStoreSerialBuilderInitial<TName>;
export function serial(name?: string) {
	return new SingleStoreSerialBuilder(name ?? '');
}
