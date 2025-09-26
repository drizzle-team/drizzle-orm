import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreYearBuilder extends SingleStoreColumnBuilder<{
	dataType: 'number year';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'SingleStoreYearBuilder';

	constructor(name: string) {
		super(name, 'number year', 'SingleStoreYear');
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
	T extends ColumnBaseConfig<'number year'>,
> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreYear';

	getSQLType(): string {
		return `year`;
	}

	override mapFromDriverValue(value: unknown): number {
		if (typeof value !== 'number') return Number(value);

		return value;
	}
}

export function year(name?: string): SingleStoreYearBuilder {
	return new SingleStoreYearBuilder(name ?? '');
}
