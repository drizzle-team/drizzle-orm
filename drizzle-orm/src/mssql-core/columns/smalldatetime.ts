import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';
import type { MsSqlDatetimeConfig } from './datetime.ts';

export class MsSqlSmallDateTimeBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlSmallDateTimeBuilder';

	constructor(name: string) {
		super(name, 'object date', 'MsSqlSmallDateTime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlSmallDateTime(table, this.config);
	}
}

export class MsSqlSmallDateTime<T extends ColumnBaseConfig<'object date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlSmallDateTime';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlSmallDateTimeBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'smalldatetime';
	}

	mapFromJsonValue(value: string): Date {
		return new Date(value);
	}
}

export class MsSqlSmallDateTimeStringBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlSmallDateTimeStringBuilder';

	constructor(name: string) {
		super(name, 'string datetime', 'MsSqlSmallDateTimeString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlSmallDateTimeString(table, this.config);
	}
}

export class MsSqlSmallDateTimeString<T extends ColumnBaseConfig<'string datetime'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlSmallDateTimeString';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlSmallDateTimeStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'smalldatetime';
	}

	override mapFromDriverValue = (value: Date | string | null): string | null => {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	};
}

export function smalldatetime<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlSmallDateTimeStringBuilder : MsSqlSmallDateTimeBuilder;
export function smalldatetime<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: string,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlSmallDateTimeStringBuilder : MsSqlSmallDateTimeBuilder;
export function smalldatetime(a?: string | MsSqlDatetimeConfig, b?: MsSqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlSmallDateTimeStringBuilder(name);
	}
	return new MsSqlSmallDateTimeBuilder(name);
}
