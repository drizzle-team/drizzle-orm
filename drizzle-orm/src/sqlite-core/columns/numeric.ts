import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export class SQLiteNumericBuilder extends SQLiteColumnBuilder<{
	dataType: 'string numeric';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'SQLiteNumericBuilder';

	constructor(name: string) {
		super(name, 'string numeric', 'SQLiteNumeric');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteNumeric(
			table,
			this.config as any,
		);
	}
}

export class SQLiteNumeric<T extends ColumnBaseConfig<'string numeric'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteNumeric';

	override mapFromDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return String(value);
	}

	getSQLType(): string {
		return 'numeric';
	}
}
export class SQLiteNumericNumberBuilder extends SQLiteColumnBuilder<{
	dataType: 'number';
	data: number;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'SQLiteNumericNumberBuilder';

	constructor(name: string) {
		super(name, 'number', 'SQLiteNumericNumber');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteNumericNumber(
			table,
			this.config as any,
		);
	}
}

export class SQLiteNumericNumber<T extends ColumnBaseConfig<'number'>> extends SQLiteColumn<T> {
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

export class SQLiteNumericBigIntBuilder extends SQLiteColumnBuilder<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'SQLiteNumericBigIntBuilder';

	constructor(name: string) {
		super(name, 'bigint int64', 'SQLiteNumericBigInt');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteNumericBigInt(
			table,
			this.config as any,
		);
	}
}

export class SQLiteNumericBigInt<T extends ColumnBaseConfig<'bigint int64'>> extends SQLiteColumn<T> {
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
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? SQLiteNumericBigIntBuilder
	: SQLiteNumericBuilder;
export function numeric<TMode extends SQLiteNumericConfig['mode']>(
	name: string,
	config?: SQLiteNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SQLiteNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? SQLiteNumericBigIntBuilder
	: SQLiteNumericBuilder;
export function numeric(a?: string | SQLiteNumericConfig, b?: SQLiteNumericConfig) {
	const { name, config } = getColumnNameAndConfig<SQLiteNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new SQLiteNumericNumberBuilder(name)
		: mode === 'bigint'
		? new SQLiteNumericBigIntBuilder(name)
		: new SQLiteNumericBuilder(name);
}
