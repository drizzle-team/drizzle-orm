import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export class MsSqlDateTimeBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeBuilder';

	constructor(name: string) {
		super(name, 'object date', 'MsSqlDateTime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTime(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTime<T extends ColumnBaseConfig<'object date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTime';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTimeBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `datetime`;
	}
}

export class MsSqlDateTimeStringBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeStringBuilder';

	constructor(name: string) {
		super(name, 'string datetime', 'MsSqlDateTimeString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTimeString(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTimeString<T extends ColumnBaseConfig<'string datetime'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTimeString';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTimeStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'datetime';
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export interface MsSqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function datetime<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeStringBuilder : MsSqlDateTimeBuilder;
export function datetime<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: string,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTimeStringBuilder : MsSqlDateTimeBuilder;
export function datetime(a?: string | MsSqlDatetimeConfig, b?: MsSqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlDateTimeStringBuilder(name);
	}
	return new MsSqlDateTimeBuilder(name);
}
