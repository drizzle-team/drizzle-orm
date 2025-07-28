import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlDateTimeBuilder extends MySqlColumnBuilder<{
	name: string;
	dataType: 'date';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}, MySqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MySqlDateTimeBuilder';

	constructor(name: string, config: MySqlDatetimeConfig | undefined) {
		super(name, 'date', 'MySqlDateTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDateTime(
			table,
			this.config as any,
		);
	}
}

export class MySqlDateTime<T extends ColumnBaseConfig<'date'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}

	override mapToDriverValue(value: Date): unknown {
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value.replace(' ', 'T') + 'Z');
	}
}

export class MySqlDateTimeStringBuilder extends MySqlColumnBuilder<{
	name: string;
	dataType: 'string';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}, MySqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MySqlDateTimeStringBuilder';

	constructor(name: string, config: MySqlDatetimeConfig | undefined) {
		super(name, 'string', 'MySqlDateTimeString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDateTimeString(
			table,
			this.config as any,
		);
	}
}

export class MySqlDateTimeString<T extends ColumnBaseConfig<'string'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateTimeStringBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime<TMode extends MySqlDatetimeConfig['mode'] & {}>(
	config?: MySqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateTimeStringBuilder : MySqlDateTimeBuilder;
export function datetime<TMode extends MySqlDatetimeConfig['mode'] & {}>(
	name: string,
	config?: MySqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateTimeStringBuilder : MySqlDateTimeBuilder;
export function datetime(a?: string | MySqlDatetimeConfig, b?: MySqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlDateTimeStringBuilder(name, config);
	}
	return new MySqlDateTimeBuilder(name, config);
}
