import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlYearBuilderInitial<TName extends string> = MySqlYearBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlYear';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class MySqlYearBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlYear'>> extends MySqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'MySqlYearBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MySqlYear');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlYear(table, this.config as any);
	}
}

export class MySqlYear<
	T extends ColumnBaseConfig<'number', 'MySqlYear'>,
> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlYear';

	getSQLType(): string {
		return `year`;
	}
}

export function year(): MySqlYearBuilderInitial<''>;
export function year<TName extends string>(name: TName): MySqlYearBuilderInitial<TName>;
export function year(name?: string) {
	return new MySqlYearBuilder(name ?? '');
}
