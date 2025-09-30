import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { MySqlStringBaseColumn, MySqlStringColumnBaseBuilder } from './string.common.ts';

export class MySqlEnumColumnBuilder<TEnum extends [string, ...string[]]> extends MySqlStringColumnBaseBuilder<{
	dataType: 'string enum';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
}, { enumValues: TEnum }> {
	static override readonly [entityKind]: string = 'MySqlEnumColumnBuilder';

	constructor(name: string, values: TEnum) {
		super(name, 'string enum', 'MySqlEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlEnumColumn(
			table,
			this.config as any,
		);
	}
}

export class MySqlEnumColumn<T extends ColumnBaseConfig<'string enum'>>
	extends MySqlStringBaseColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

// enum as ts enum
export class MySqlEnumObjectColumnBuilder<TEnum extends object> extends MySqlStringColumnBaseBuilder<{
	dataType: 'string enum';
	data: TEnum[keyof TEnum];
	driverParam: string;
	enumValues: string[];
}, { enumValues: TEnum }> {
	static override readonly [entityKind]: string = 'MySqlEnumObjectColumnBuilder';

	constructor(name: string, values: TEnum) {
		super(name, 'string enum', 'MySqlEnumObjectColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlEnumObjectColumn(
			table,
			this.config as any,
		);
	}
}

export class MySqlEnumObjectColumn<T extends ColumnBaseConfig<'string enum'>>
	extends MySqlStringBaseColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'MySqlEnumObjectColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	values: T | Writable<T>,
): MySqlEnumColumnBuilder<Writable<T>>;
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	values: T | Writable<T>,
): MySqlEnumColumnBuilder<Writable<T>>;
export function mysqlEnum<E extends Record<string, string>>(
	enumObj: NonArray<E>,
): MySqlEnumObjectColumnBuilder<E>;
export function mysqlEnum<E extends Record<string, string>>(
	name: string,
	values: NonArray<E>,
): MySqlEnumObjectColumnBuilder<E>;
export function mysqlEnum(
	a?: string | readonly [string, ...string[]] | [string, ...string[]] | Record<string, string>,
	b?: readonly [string, ...string[]] | [string, ...string[]] | Record<string, string>,
): any {
	// if name + array or just array - it means we have string union passed
	if (typeof a === 'string' && Array.isArray(b) || Array.isArray(a)) {
		const name = typeof a === 'string' && a.length > 0 ? a : '';
		const values = (typeof a === 'string' ? b : a) ?? [];

		if (values.length === 0) {
			throw new Error(`You have an empty array for "${name}" enum values`);
		}

		return new MySqlEnumColumnBuilder(name, values as any);
	}

	if (typeof a === 'string' && typeof b === 'object' || typeof a === 'object') {
		const name = typeof a === 'object' ? '' : a;
		const values = typeof a === 'object' ? Object.values(a) : typeof b === 'object' ? Object.values(b) : [];

		if (values.length === 0) {
			throw new Error(`You have an empty array for "${name}" enum values`);
		}

		return new MySqlEnumObjectColumnBuilder(name, values as any);
	}
}
