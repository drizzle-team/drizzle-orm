import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlDateBaseColumn, MySqlDateColumnBaseBuilder } from './date.common.ts';

export class MySqlTimestampBuilder extends MySqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}, MySqlTimestampConfig> {
	static override readonly [entityKind]: string = 'MySqlTimestampBuilder';

	constructor(name: string, config: MySqlTimestampConfig | undefined) {
		super(name, 'object date', 'MySqlTimestamp');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlTimestamp(
			table,
			this.config as any,
		);
	}
}

export class MySqlTimestamp<T extends ColumnBaseConfig<'object date'>>
	extends MySqlDateBaseColumn<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestamp';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return new Date(value + '+0000');

		return value;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export class MySqlTimestampStringBuilder extends MySqlDateColumnBaseBuilder<{
	dataType: 'string timestamp';
	data: string;
	driverParam: string | number;
}, MySqlTimestampConfig> {
	static override readonly [entityKind]: string = 'MySqlTimestampStringBuilder';

	constructor(name: string, config: MySqlTimestampConfig | undefined) {
		super(name, 'string timestamp', 'MySqlTimestampString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlTimestampString(
			table,
			this.config as any,
		);
	}
}

export class MySqlTimestampString<T extends ColumnBaseConfig<'string timestamp'>>
	extends MySqlDateBaseColumn<T, MySqlTimestampConfig>
{
	static override readonly [entityKind]: string = 'MySqlTimestampString';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const shortened = value.toISOString().slice(0, -1).replace('T', ' ');
		if (shortened.endsWith('.000')) return shortened.slice(0, -4);

		return shortened;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MySqlTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp<TMode extends MySqlTimestampConfig['mode'] & {}>(
	config?: MySqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlTimestampStringBuilder
	: MySqlTimestampBuilder;
export function timestamp<TMode extends MySqlTimestampConfig['mode'] & {}>(
	name: string,
	config?: MySqlTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlTimestampStringBuilder
	: MySqlTimestampBuilder;
export function timestamp(a?: string | MySqlTimestampConfig, b: MySqlTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MySqlTimestampStringBuilder(name, config);
	}
	return new MySqlTimestampBuilder(name, config);
}
