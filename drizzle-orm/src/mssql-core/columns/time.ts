import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlTimeStringBuilderInitial<TName extends string> = MsSqlTimeStringBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlTime';
		data: string;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlTimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlTime'>>
	extends MsSqlColumnBuilder<
		T,
		TimeConfig
	>
{
	static override readonly [entityKind]: string = 'MsSqlTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'MsSqlTime');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTimeString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlTimeString<
	T extends ColumnBaseConfig<'string', 'MsSqlTime'>,
> extends MsSqlColumn<T, TimeConfig> {
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

export type MsSqlTimeBuilderInitial<TName extends string> = MsSqlTimeBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'MsSqlTime';
		data: Date;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlTime'>> extends MsSqlColumnBuilder<
	T,
	TimeConfig
> {
	static override readonly [entityKind]: string = 'MsSqlTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'date', 'MsSqlTime');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTime<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlTime<
	T extends ColumnBaseConfig<'date', 'MsSqlTime'>,
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

export function time(): MsSqlTimeBuilderInitial<''>;
export function time<TMode extends TimeConfig['mode'] & {}>(
	config?: TimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlTimeStringBuilderInitial<''> : MsSqlTimeBuilderInitial<''>;
export function time<TName extends string, TMode extends TimeConfig['mode'] & {}>(
	name: TName,
	config?: TimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlTimeStringBuilderInitial<TName>
	: MsSqlTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b?: TimeConfig) {
	const { name, config } = getColumnNameAndConfig<TimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlTimeStringBuilder(name, config);
	}
	return new MsSqlTimeBuilder(name, config);
}
