import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';
import type { PgRange } from './range.common.ts';
import { parseRange, serializeRange } from './range.common.ts';

export type PgDateRangeBuilderInitial<TName extends string> = PgDateRangeBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgDateRange';
	data: PgRange<string>;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgDateRangeBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgDateRange'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgDateRangeBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgDateRange');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDateRange<MakeColumnConfig<T, TTableName>> {
		return new PgDateRange<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgDateRange<T extends ColumnBaseConfig<'json', 'PgDateRange'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgDateRange';

	getSQLType(): string {
		return 'daterange';
	}

	override mapFromDriverValue(value: string): PgRange<string> {
		return parseRange(value, (s) => s);
	}

	override mapToDriverValue(value: PgRange<string>): string {
		return serializeRange(value, (s) => s);
	}
}

export type PgDateRangeStringBuilderInitial<TName extends string> = PgDateRangeStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgDateRangeString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgDateRangeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgDateRangeString'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgDateRangeStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgDateRangeString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDateRangeString<MakeColumnConfig<T, TTableName>> {
		return new PgDateRangeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDateRangeString<T extends ColumnBaseConfig<'string', 'PgDateRangeString'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgDateRangeString';

	getSQLType(): string {
		return 'daterange';
	}
}

export interface PgDateRangeConfig<TMode extends 'string' | 'object' = 'string' | 'object'> {
	mode?: TMode;
}

export function daterange(): PgDateRangeBuilderInitial<''>;
export function daterange<TMode extends PgDateRangeConfig['mode'] & {}>(
	config?: PgDateRangeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgDateRangeStringBuilderInitial<''>
	: PgDateRangeBuilderInitial<''>;
export function daterange<TName extends string, TMode extends PgDateRangeConfig['mode'] & {}>(
	name: TName,
	config?: PgDateRangeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgDateRangeStringBuilderInitial<TName>
	: PgDateRangeBuilderInitial<TName>;
export function daterange(a?: string | PgDateRangeConfig, b?: PgDateRangeConfig) {
	const { name, config } = getColumnNameAndConfig<PgDateRangeConfig>(a, b);
	if (config?.mode === 'string') {
		return new PgDateRangeStringBuilder(name);
	}
	return new PgDateRangeBuilder(name);
}
