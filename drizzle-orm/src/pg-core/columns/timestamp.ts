import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';

export class PgTimestampBuilder extends PgDateColumnBaseBuilder<
	{
		name: string;
		dataType: 'object date';
		data: Date;
		driverParam: string;
		enumValues: undefined;
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

export class PgTimestamp<T extends ColumnBaseConfig<'object date'>> extends PgColumn<T> {
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

	override mapFromDriverValue = (value: string): Date | null => {
		return new Date(this.withTimezone ? value : value + '+0000');
	};

	override mapToDriverValue = (value: Date): string => {
		return value.toISOString();
	};
}

export class PgTimestampStringBuilder extends PgDateColumnBaseBuilder<
	{
		name: string;
		dataType: 'string timestamp';
		data: string;
		driverParam: string;
		enumValues: undefined;
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

export class PgTimestampString<T extends ColumnBaseConfig<'string timestamp'>> extends PgColumn<T> {
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
