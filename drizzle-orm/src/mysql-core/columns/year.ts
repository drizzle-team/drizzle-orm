import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlYearBuilder extends MySqlColumnBuilder<{
	dataType: 'number year';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'MySqlYearBuilder';

	constructor(name: string) {
		super(name, 'number year', 'MySqlYear');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlYear(table, this.config as any);
	}
}

export class MySqlYear<
	T extends ColumnBaseConfig<'number year'>,
> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlYear';

	getSQLType(): string {
		return `year`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}
}

export function year(name?: string): MySqlYearBuilder {
	return new MySqlYearBuilder(name ?? '');
}
