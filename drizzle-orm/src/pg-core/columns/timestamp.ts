import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBuilder } from './date.common.ts';

export class PgTimestampBuilder extends PgDateColumnBuilder<
	{
		dataType: 'object date';
		data: Date;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgTimestampBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'object date', 'PgTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgTimestamp(table, this.config as any);
	}
}

export class PgTimestamp extends PgColumn<'object date'> {
	static override readonly [entityKind]: string = 'PgTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: PgTable<any>, config: PgTimestampBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000');

		return value;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export class PgTimestampStringBuilder extends PgDateColumnBuilder<
	{
		dataType: 'string timestamp';
		data: string;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgTimestampStringBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string timestamp', 'PgTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgTimestampString(
			table,
			this.config as any,
		);
	}
}

export class PgTimestampString extends PgColumn<'string timestamp'> {
	static override readonly [entityKind]: string = 'PgTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: PgTable<any>, config: PgTimestampStringBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const shortened = value.toISOString().slice(0, -1).replace('T', ' ');
		if (this.withTimezone) {
			return `${shortened}+00`;
		}

		return shortened;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp<TMode extends PgTimestampConfig['mode'] & {}>(
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilder : PgTimestampBuilder;
export function timestamp<TMode extends PgTimestampConfig['mode'] & {}>(
	name: string,
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilder : PgTimestampBuilder;
export function timestamp(a?: string | PgTimestampConfig, b: PgTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<PgTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
