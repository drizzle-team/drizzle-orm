import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdDateColumnBaseBuilder } from './date.common.ts';

export type FirebirdDateBuilderInitial<TName extends string> = FirebirdDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'FirebirdDate';
	data: Date;
	driverParam: Date;
	enumValues: undefined;
}>;

export class FirebirdDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'FirebirdDate'>>
	extends FirebirdDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'FirebirdDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdDate<MakeColumnConfig<T, TTableName>> {
		return new FirebirdDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdDate<T extends ColumnBaseConfig<'date', 'FirebirdDate'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string | Date): Date {
		if (typeof value === 'string') return new Date(value);

		return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
	}

	override mapToDriverValue(value: Date): Date {
		return value;
	}
}

export type FirebirdDateStringBuilderInitial<TName extends string> = FirebirdDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdDateString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class FirebirdDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'FirebirdDateString'>>
	extends FirebirdDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'FirebirdDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdDateString<MakeColumnConfig<T, TTableName>> {
		return new FirebirdDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdDateString<T extends ColumnBaseConfig<'string', 'FirebirdDateString'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdDateString';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		return formatFirebirdDate(value);
	}
}

function formatFirebirdDate(value: Date): string {
	const year = String(value.getFullYear()).padStart(4, '0');
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

export interface FirebirdDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date(): FirebirdDateStringBuilderInitial<''>;
export function date<TMode extends FirebirdDateConfig['mode'] & {}>(
	config?: FirebirdDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? FirebirdDateBuilderInitial<''> : FirebirdDateStringBuilderInitial<''>;
export function date<TName extends string, TMode extends FirebirdDateConfig['mode'] & {}>(
	name: TName,
	config?: FirebirdDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? FirebirdDateBuilderInitial<TName> : FirebirdDateStringBuilderInitial<TName>;
export function date(a?: string | FirebirdDateConfig, b?: FirebirdDateConfig) {
	const { name, config } = getColumnNameAndConfig<FirebirdDateConfig>(a, b);
	if (config?.mode === 'date') {
		return new FirebirdDateBuilder(name);
	}
	return new FirebirdDateStringBuilder(name);
}
