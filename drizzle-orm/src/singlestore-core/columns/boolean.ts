import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreBooleanBuilder extends SingleStoreColumnBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: number | boolean;
}> {
	static override readonly [entityKind]: string = 'SingleStoreBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'SingleStoreBoolean');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreBoolean(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreBoolean<T extends ColumnBaseConfig<'boolean'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreBoolean';

	/** @internal */
	override readonly codec = 'boolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name?: string): SingleStoreBooleanBuilder {
	return new SingleStoreBooleanBuilder(name ?? '');
}
