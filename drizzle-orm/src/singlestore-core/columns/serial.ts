import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreSerialBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	dataType: 'number uint53';
	data: number;
	driverParam: number;

	isPrimaryKey: true;
	hasDefault: true;
	notNull: true;
	isAutoincrement: true;
}> {
	static override readonly [entityKind]: string = 'SingleStoreSerialBuilder';

	constructor(name: string) {
		super(name, 'number uint53', 'SingleStoreSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreSerial(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreSerial<
	T extends ColumnBaseConfig<'number uint53'>,
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

export function serial(name?: string): SingleStoreSerialBuilder {
	return new SingleStoreSerialBuilder(name ?? '');
}
