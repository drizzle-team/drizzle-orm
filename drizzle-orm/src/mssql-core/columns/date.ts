import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlDateBuilderInitial<TName extends string> = MsSqlDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'MsSqlDate';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlDate'>> extends MsSqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MsSqlDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'MsSqlDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDate<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDate<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlDate<T extends ColumnBaseConfig<'date', 'MsSqlDate'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDate';

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateBuilder<T>['config'],
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

export type MsSqlDateStringBuilderInitial<TName extends string> = MsSqlDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlDateString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlDateString'>>
	extends MsSqlColumnBuilder<T>
{
	static readonly [entityKind]: string = 'MsSqlDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'MsSqlDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateString<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateString<T extends ColumnBaseConfig<'string', 'MsSqlDateString'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateString';

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateStringBuilder<T>['config'],
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

export function date<TName extends string, TMode extends MsSqlDateConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateStringBuilderInitial<TName> : MsSqlDateBuilderInitial<TName>;
export function date(name: string, config: MsSqlDateConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlDateStringBuilder(name);
	}
	return new MsSqlDateBuilder(name);
}
