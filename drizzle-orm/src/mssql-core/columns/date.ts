import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export class MsSqlDateBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'MsSqlDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'MsSqlDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDate(table, this.config);
	}
}

export class MsSqlDate<T extends ColumnBaseConfig<'object date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDate';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		return new Date(value);
	}
}

export class MsSqlDateStringBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'string date';
	data: string;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'MsSqlDateStringBuilder';

	constructor(name: string) {
		super(name, 'string date', 'MsSqlDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateString(
			table,
			this.config,
		);
	}
}

export class MsSqlDateString<T extends ColumnBaseConfig<'string date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateString';

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString().split('T')[0] ?? null;
	}
}

export interface MsSqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date<TMode extends MsSqlDateConfig['mode'] & {}>(
	config?: MsSqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateStringBuilder : MsSqlDateBuilder;
export function date<TMode extends MsSqlDateConfig['mode'] & {}>(
	name: string,
	config?: MsSqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateStringBuilder : MsSqlDateBuilder;
export function date(a?: string | MsSqlDateConfig, b?: MsSqlDateConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDateConfig | undefined>(a, b);

	if (config?.mode === 'string') {
		return new MsSqlDateStringBuilder(name);
	}
	return new MsSqlDateBuilder(name);
}
