import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlDateBuilder extends MySqlColumnBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'MySqlDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'MySqlDate');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDate(table, this.config as any);
	}
}

export class MySqlDate<T extends ColumnBaseConfig<'object date'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlDate';

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export class MySqlDateStringBuilder extends MySqlColumnBuilder<{
	dataType: 'string date';
	data: string;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'MySqlDateStringBuilder';

	constructor(name: string) {
		super(name, 'string date', 'MySqlDateString');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDateString(
			table,
			this.config as any,
		);
	}
}

export class MySqlDateString<T extends ColumnBaseConfig<'string date'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlDateString';

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		return value.toISOString().slice(0, -14);
	}
}

export interface MySqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date<TMode extends MySqlDateConfig['mode'] & {}>(
	config?: MySqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateStringBuilder : MySqlDateBuilder;
export function date<TMode extends MySqlDateConfig['mode'] & {}>(
	name: string,
	config?: MySqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateStringBuilder : MySqlDateBuilder;
export function date(a?: string | MySqlDateConfig, b?: MySqlDateConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlDateConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlDateStringBuilder(name);
	}
	return new MySqlDateBuilder(name);
}
