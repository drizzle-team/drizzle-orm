import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreTimeBuilder extends SingleStoreColumnBuilder<
	{
		dataType: 'string time';
		data: string;
		driverParam: string | number;
	}
> {
	static override readonly [entityKind]: string = 'SingleStoreTimeBuilder';

	constructor(
		name: string,
	) {
		super(name, 'string time', 'SingleStoreTime');
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
	T extends ColumnBaseConfig<'string time'>,
> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreTime';

	getSQLType(): string {
		return `time`;
	}
}

export function time(name?: string): SingleStoreTimeBuilder {
	return new SingleStoreTimeBuilder(name ?? '');
}
