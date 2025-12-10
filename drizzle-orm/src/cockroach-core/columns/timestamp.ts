import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachDateColumnBaseBuilder } from './date.common.ts';

export class CockroachTimestampBuilder extends CockroachDateColumnBaseBuilder<
	{
		dataType: 'object date';
		data: Date;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachTimestampBuilder';

	constructor(name: string, withTimezone: boolean, precision: number | undefined) {
		super(name, 'object date', 'CockroachTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachTimestamp(
			table,
			this.config,
		);
	}
}

export class CockroachTimestamp<T extends ColumnBaseConfig<'object date'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: CockroachTable<any>, config: CockroachTimestampBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${this.withTimezone ? 'tz' : ''}${precision}`;
	}

	override mapFromDriverValue = (value: string): Date | null => {
		return new Date(this.withTimezone ? value : value + '+0000');
	};

	override mapToDriverValue = (value: Date | string): string => {
		if (typeof value === 'string') return value;
		return value.toISOString();
	};
}

export class CockroachTimestampStringBuilder extends CockroachDateColumnBaseBuilder<
	{
		dataType: 'string timestamp';
		data: string;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachTimestampStringBuilder';

	constructor(name: string, withTimezone: boolean, precision: number | undefined) {
		super(name, 'string timestamp', 'CockroachTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachTimestampString(
			table,
			this.config,
		);
	}
}

export class CockroachTimestampString<T extends ColumnBaseConfig<'string timestamp'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachTimestampStringBuilder['config'],
	) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${this.withTimezone ? 'tz' : ''}${precision}`;
	}

	override mapToDriverValue = (value: Date | string): string => {
		if (typeof value === 'string') return value;
		return value.toISOString();
	};
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CockroachTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp<TMode extends CockroachTimestampConfig['mode'] & {}>(
	config?: CockroachTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachTimestampStringBuilder
	: CockroachTimestampBuilder;
export function timestamp<TMode extends CockroachTimestampConfig['mode'] & {}>(
	name: string,
	config?: CockroachTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachTimestampStringBuilder
	: CockroachTimestampBuilder;
export function timestamp(a?: string | CockroachTimestampConfig, b: CockroachTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new CockroachTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new CockroachTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
