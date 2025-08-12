import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlSerialBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number uint';
	data: number;
	driverParam: number;
	enumValues: undefined;
	hasDefault: true;
	notNull: true;
	isPrimaryKey: true;
	isAutoincrement: true;
}> {
	static override readonly [entityKind]: string = 'MySqlSerialBuilder';

	constructor(name: string) {
		super(name, 'number uint', 'MySqlSerial');
		this.config.hasDefault = true;
		this.config.autoIncrement = true;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlSerial(table, this.config as any);
	}
}

export class MySqlSerial<
	T extends ColumnBaseConfig<'number uint'>,
> extends MySqlColumnWithAutoIncrement<T> {
	static override readonly [entityKind]: string = 'MySqlSerial';

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

export function serial(name?: string): MySqlSerialBuilder {
	return new MySqlSerialBuilder(name ?? '');
}
