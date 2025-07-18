import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreYearBuilderInitial<TName extends string> = SingleStoreYearBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreYear';
	data: number;
	driverParam: number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreYearBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreYear'>>
	extends SingleStoreColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SingleStoreYearBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SingleStoreYear');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreYear(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreYear<
	T extends ColumnBaseConfig<'number', 'SingleStoreYear'>,
> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreYear';

	getSQLType(): string {
		return `year`;
	}
}

export function year(): SingleStoreYearBuilderInitial<''>;
export function year<TName extends string>(name: TName): SingleStoreYearBuilderInitial<TName>;
export function year(name?: string) {
	return new SingleStoreYearBuilder(name ?? '');
}
