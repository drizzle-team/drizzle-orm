import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreTimeBuilder extends SingleStoreColumnBuilder<
	{
		name: string;
		dataType: 'string';
		data: string;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
> {
	static override readonly [entityKind]: string = 'SingleStoreTimeBuilder';

	constructor(
		name: string,
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

export function time(name?: string): SingleStoreTimeBuilder {
	return new SingleStoreTimeBuilder(name ?? '');
}
