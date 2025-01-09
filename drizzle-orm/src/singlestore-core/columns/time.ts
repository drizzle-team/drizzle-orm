import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreTimeBuilderInitial<TName extends string> = SingleStoreTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreTime';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreTime'>>
	extends SingleStoreColumnBuilder<
		T
	>
{
	static override readonly [entityKind]: string = 'SingleStoreTimeBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'string', 'SingleStoreTime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreTime<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreTime<
	T extends ColumnBaseConfig<'string', 'SingleStoreTime'>,
> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreTime';

	getSQLType(): string {
		return `time`;
	}
}

export function time(): SingleStoreTimeBuilderInitial<''>;
export function time<TName extends string>(name: TName): SingleStoreTimeBuilderInitial<TName>;
export function time(name?: string) {
	return new SingleStoreTimeBuilder(name ?? '');
}
