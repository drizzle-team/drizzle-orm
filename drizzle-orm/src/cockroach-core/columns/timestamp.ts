import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, type CockroachColumnBuilderRuntimeConfig } from './common.ts';
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

export class CockroachTimestamp<T extends CockroachColumnBaseConfig<'object date'>>
	extends CockroachColumn<'object date', T>
{
	static override readonly [entityKind]: string = 'CockroachTimestamp';

	/** @internal */
	override readonly codec: 'timestamp' | 'timestamptz';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & { withTimezone: boolean; precision: number | undefined },
	) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
		this.codec = config.withTimezone ? 'timestamptz' : 'timestamp';
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

export class CockroachTimestampString<T extends CockroachColumnBaseConfig<'string timestamp'>>
	extends CockroachColumn<'string timestamp', T>
{
	static override readonly [entityKind]: string = 'CockroachTimestampString';

	/** @internal */
	override readonly codec: 'timestamp:string' | 'timestamptz:string';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & { withTimezone: boolean; precision: number | undefined },
	) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
		this.codec = config.withTimezone ? 'timestamptz:string' : 'timestamp:string';
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
