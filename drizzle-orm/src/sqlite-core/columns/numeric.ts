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

	override mapFromDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return String(value);
	}

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

	override mapFromDriverValue(value: unknown): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}

	override mapToDriverValue = String;

	getSQLType(): string {
		return 'numeric';
	}
}

export type SQLiteNumericBigIntBuilderInitial<TName extends string> = SQLiteNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'SQLiteNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class SQLiteNumericBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'SQLiteNumericBigInt'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteNumericBigIntBuilder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'SQLiteNumericBigInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new SQLiteNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteNumericBigInt<T extends ColumnBaseConfig<'bigint', 'SQLiteNumericBigInt'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteNumericBigInt';

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

	getSQLType(): string {
		return 'numeric';
	}
}

export type SQLiteNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> = {
	mode: T;
};

export function numeric<TMode extends SQLiteNumericConfig['mode']>(
	config?: SQLiteNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? SQLiteNumericBigIntBuilderInitial<''>
	: SQLiteNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends SQLiteNumericConfig['mode']>(
	name: TName,
	config?: SQLiteNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? SQLiteNumericBigIntBuilderInitial<TName>
	: SQLiteNumericBuilderInitial<TName>;
export function numeric(a?: string | SQLiteNumericConfig, b?: SQLiteNumericConfig) {
	const { name, config } = getColumnNameAndConfig<SQLiteNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new SQLiteNumericNumberBuilder(name)
		: mode === 'bigint'
		? new SQLiteNumericBigIntBuilder(name)
		: new SQLiteNumericBuilder(name);
}
