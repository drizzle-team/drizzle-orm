import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';

import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteNumericBuilderInitial<TName extends string> = SQLiteNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SQLiteNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class SQLiteNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'SQLiteNumeric'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteNumericBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SQLiteNumeric');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteNumeric<MakeColumnConfig<T, TTableName>> {
		return new SQLiteNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteNumeric<T extends ColumnBaseConfig<'string', 'SQLiteNumeric'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteNumeric';

	getSQLType(): string {
		return 'numeric';
	}
}

export type SQLiteNumericNumberBuilderInitial<TName extends string> = SQLiteNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SQLiteNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SQLiteNumericNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'SQLiteNumericNumber'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteNumericNumberBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SQLiteNumericNumber');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new SQLiteNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteNumericNumber<T extends ColumnBaseConfig<'number', 'SQLiteNumericNumber'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteNumericNumber';

	getSQLType(): string {
		return 'numeric';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): number {
		return Number(value);
	}

	override mapToDriverValue(value: number): string {
		return value.toString();
	}
}

interface SQLiteNumericConfig<T extends 'number' | 'string' = 'number' | 'string'> {
	mode: T;
}

export function numeric(): SQLiteNumericBuilderInitial<''>;
export function numeric<TMode extends SQLiteNumericConfig['mode']>(
	config?: SQLiteNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilderInitial<''>
	: SQLiteNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends SQLiteNumericConfig['mode']>(
	name: TName,
	config?: SQLiteNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilderInitial<TName>
	: SQLiteNumericBuilderInitial<TName>;
export function numeric(a?: string | SQLiteNumericConfig, b?: SQLiteNumericConfig) {
	const { name, config } = getColumnNameAndConfig<SQLiteNumericConfig | undefined>(a, b);
	if (config?.mode === 'number') {
		return new SQLiteNumericNumberBuilder(name);
	}
	return new SQLiteNumericBuilder(name);
}
