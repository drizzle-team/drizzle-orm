import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
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

export class SingleStoreTimeBuilder<T extends ColumnBuilderBaseConfig<'string'>>
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
	override build(table: SingleStoreTable) {
		return new SingleStoreTime(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreTime<
	T extends ColumnBaseConfig<'string'>,
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
