import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlBooleanBuilder extends MySqlColumnBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: number | boolean;
}> {
	static override readonly [entityKind]: string = 'MySqlBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'MySqlBoolean');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBoolean(
			table,
			this.config as any,
		);
	}
}

export class MySqlBoolean<T extends ColumnBaseConfig<'boolean'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean(name?: string): MySqlBooleanBuilder {
	return new MySqlBooleanBuilder(name ?? '');
}
