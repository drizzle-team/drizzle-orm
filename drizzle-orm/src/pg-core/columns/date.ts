import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';

export type PgDateBuilderInitial<TName extends string> = PgDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgDate';
	data: Date;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgDate'>> extends PgDateColumnBaseBuilder<T> {
	static readonly [entityKind]: string = 'PgDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'PgDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDate<MakeColumnConfig<T, TTableName>> {
		return new PgDate<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgDate<T extends ColumnBaseConfig<'date', 'PgDate'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

export type PgDateStringBuilderInitial<TName extends string> = PgDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgDateString';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgDateString'>>
	extends PgDateColumnBaseBuilder<T>
{
	static readonly [entityKind]: string = 'PgDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDateString<MakeColumnConfig<T, TTableName>> {
		return new PgDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDateString<T extends ColumnBaseConfig<'string', 'PgDateString'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgDateString';

	getSQLType(): string {
		return 'date';
	}
}

export interface PgDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date(): PgDateStringBuilderInitial<''>;
export function date<TMode extends PgDateConfig['mode'] & {}>(
	config?: PgDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? PgDateBuilderInitial<''> : PgDateStringBuilderInitial<''>;
export function date<TName extends string, TMode extends PgDateConfig['mode'] & {}>(
	name: TName,
	config?: PgDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? PgDateBuilderInitial<TName> : PgDateStringBuilderInitial<TName>;
export function date<TName extends string, TMode extends PgDateConfig['mode'] & {}>(
	a?: TName | PgDateConfig<TMode>,
	b?: PgDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? PgDateBuilderInitial<TName> : PgDateStringBuilderInitial<TName> {
	const { name, config } = getColumnNameAndConfig<TName, PgDateConfig<TMode>>(a, b);
	if (config?.mode === 'date') {
		return new PgDateBuilder(name) as any;
	}
	return new PgDateStringBuilder(name) as any;
}
