import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import type { MsSqlDatetimeConfig } from './date.common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export class MsSqlDateTimeOffsetBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeOffsetBuilder';

	constructor(name: string, config: MsSqlDatetimeConfig | undefined) {
		super(name, 'object date', 'MsSqlDateTimeOffset');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTimeOffset(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTimeOffset<T extends ColumnBaseConfig<'object date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeOffset';

	readonly precision: number | undefined;

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTimeOffsetBuilder['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetimeoffset${precision}`;
	}
}

export class MsSqlDateTimeOffsetStringBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeOffsetStringBuilder';

	constructor(name: string, config: MsSqlDatetimeConfig | undefined) {
		super(name, 'string datetime', 'MsSqlDateTimeOffsetString');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTimeOffsetString(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTimeOffsetString<T extends ColumnBaseConfig<'string datetime'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeOffsetString';

	readonly precision: number | undefined;

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTimeOffsetStringBuilder['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetimeoffset${precision}`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export function datetimeoffset(): MsSqlDateTimeOffsetBuilder;
export function datetimeoffset<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeOffsetStringBuilder
	: MsSqlDateTimeOffsetBuilder;
export function datetimeoffset<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: string,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeOffsetStringBuilder
	: MsSqlDateTimeOffsetBuilder;
export function datetimeoffset(a?: string | MsSqlDatetimeConfig, b?: MsSqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlDateTimeOffsetStringBuilder(name, config);
	}
	return new MsSqlDateTimeOffsetBuilder(name, config);
}
