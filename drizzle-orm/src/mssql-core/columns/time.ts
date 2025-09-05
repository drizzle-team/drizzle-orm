import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlTimeStringBuilder extends MsSqlColumnBuilder<
	{
		dataType: 'string time';
		data: string;
		driverParam: string | Date;
	},
	TimeConfig
> {
	static override readonly [entityKind]: string = 'MsSqlTimeBuilder';

	constructor(
		name: string,
		config: TimeConfig | undefined,
	) {
		super(name, 'string time', 'MsSqlTime');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlTimeString(
			table,
			this.config,
		);
	}
}

export class MsSqlTimeString<T extends ColumnBaseConfig<'string time'>> extends MsSqlColumn<T, TimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlTime';

	readonly fsp: number | undefined = this.config.precision;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString().split('T')[1]?.split('Z')[0] ?? null;
	}
}

export class MsSqlTimeBuilder extends MsSqlColumnBuilder<
	{
		dataType: 'object date';
		data: Date;
		driverParam: string | Date;
	},
	TimeConfig
> {
	static override readonly [entityKind]: string = 'MsSqlTimeBuilder';

	constructor(
		name: string,
		config: TimeConfig | undefined,
	) {
		super(name, 'object date', 'MsSqlTime');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlTime(table, this.config);
	}
}

export class MsSqlTime<
	T extends ColumnBaseConfig<'object date'>,
> extends MsSqlColumn<T, TimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlTime';

	readonly fsp: number | undefined = this.config.precision;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}
export type TimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> = {
	precision?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
	mode?: TMode;
};

export function time<TMode extends TimeConfig['mode'] & {}>(
	config?: TimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlTimeStringBuilder : MsSqlTimeBuilder;
export function time<TMode extends TimeConfig['mode'] & {}>(
	name: string,
	config?: TimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlTimeStringBuilder
	: MsSqlTimeBuilder;
export function time(a?: string | TimeConfig, b?: TimeConfig) {
	const { name, config } = getColumnNameAndConfig<TimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlTimeStringBuilder(name, config);
	}
	return new MsSqlTimeBuilder(name, config);
}
