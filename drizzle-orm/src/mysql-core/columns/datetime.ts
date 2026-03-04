import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlDateBaseColumn, MySqlDateColumnBaseBuilder } from './date.common.ts';

export class MySqlDateTimeBuilder extends MySqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}, MySqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MySqlDateTimeBuilder';

	constructor(name: string, config: MySqlDatetimeConfig | undefined) {
		super(name, 'object date', 'MySqlDateTime');
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

export class MySqlDateTime<T extends ColumnBaseConfig<'object date'>> extends MySqlDateBaseColumn<T> {
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

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}

	override mapFromDriverValue(value: string | Date): Date {
		if (typeof value === 'string') return new Date(value.replace(' ', 'T') + 'Z');
		return value;
	}
}

export class MySqlDateTimeStringBuilder extends MySqlDateColumnBaseBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | number;
}, MySqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MySqlDateTimeStringBuilder';

	constructor(name: string, config: MySqlDatetimeConfig | undefined) {
		super(name, 'string datetime', 'MySqlDateTimeString');
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

export class MySqlDateTimeString<T extends ColumnBaseConfig<'string datetime'>> extends MySqlDateBaseColumn<T> {
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

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -5).replace('T', ' ');
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().replace('T', ' ').replace('Z', '');
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
