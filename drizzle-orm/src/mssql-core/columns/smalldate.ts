import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export type MsSqlSmallDateBuilderInitial<TName extends string> = MsSqlSmallDateBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'MsSqlSmallDate';
		data: Date;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlSmallDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlSmallDate'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlSamalldateConfig>
{
	static readonly [entityKind]: string = 'MsSqlSmallDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'MsSqlSmallDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlSmallDate<MakeColumnConfig<T, TTableName>> {
		return new MsSqlSmallDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlSmallDate<T extends ColumnBaseConfig<'date', 'MsSqlSmallDate'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlSmallDate';

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlSmallDateBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `smalldate`;
	}
}

export type MsSqlSmallDateStringBuilderInitial<TName extends string> = MsSqlSmallDateStringBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlSmallDateString';
		data: string;
		driverParam: string | Date;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlSmallDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlSmallDateString'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlSamalldateConfig>
{
	static readonly [entityKind]: string = 'MsSqlSmallDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'MsSqlSmallDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlSmallDateString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlSmallDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlSmallDateString<T extends ColumnBaseConfig<'string', 'MsSqlSmallDateString'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlSmallDateString';

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlSmallDateStringBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'smalldate';
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export interface MsSqlSamalldateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function smalldate<TName extends string, TMode extends MsSqlSamalldateConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlSamalldateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlSmallDateStringBuilderInitial<TName>
	: MsSqlSmallDateBuilderInitial<TName>;
export function smalldate(name: string, config: MsSqlSamalldateConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlSmallDateStringBuilder(name);
	}
	return new MsSqlSmallDateBuilder(name);
}
