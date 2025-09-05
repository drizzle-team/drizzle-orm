import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreJsonBuilder extends SingleStoreColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'SingleStoreJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'SingleStoreJson');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreJson(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreJson<T extends ColumnBaseConfig<'object json'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json(name?: string): SingleStoreJsonBuilder {
	return new SingleStoreJsonBuilder(name ?? '');
}
