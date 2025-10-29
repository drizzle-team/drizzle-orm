import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// Enum as ts enum

export type PgEnumObjectColumnBuilderInitial<TName extends string, TValues extends object> = PgEnumObjectColumnBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgEnumObjectColumn';
	data: TValues[keyof TValues];
	enumValues: string[];
	driverParam: string;
}>;

export interface PgEnumObject<TValues extends object> {
	(): PgEnumObjectColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): PgEnumObjectColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): PgEnumObjectColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	readonly schema: string | undefined;
	/** @internal */
	[isPgEnumSym]: true;
}

export class PgEnumObjectColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgEnumObjectColumn'> & { enumValues: string[] },
> extends PgColumnBuilder<T, { enum: PgEnumObject<any> }> {
	static override readonly [entityKind]: string = 'PgEnumObjectColumnBuilder';

	constructor(name: T['name'], enumInstance: PgEnumObject<any>) {
		super(name, 'string', 'PgEnumObjectColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgEnumObjectColumn<MakeColumnConfig<T, TTableName>> {
		return new PgEnumObjectColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgEnumObjectColumn<T extends ColumnBaseConfig<'string', 'PgEnumObjectColumn'> & { enumValues: object }>
	extends PgColumn<T, { enum: PgEnumObject<object> }>
{
	static override readonly [entityKind]: string = 'PgEnumObjectColumn';

	readonly enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgEnumObjectColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Enum as string union

export type PgEnumColumnBuilderInitial<TName extends string, TValues extends [string, ...string[]]> =
	PgEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'PgEnumColumn';
		data: TValues[number];
		enumValues: TValues;
		driverParam: string;
	}>;

const isPgEnumSym = Symbol.for('drizzle:isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> {
	(): PgEnumColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): PgEnumColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): PgEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	readonly schema: string | undefined;
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}

export class PgEnumColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgEnumColumn'> & { enumValues: [string, ...string[]] },
> extends PgColumnBuilder<T, { enum: PgEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'PgEnumColumnBuilder';

	constructor(name: T['name'], enumInstance: PgEnum<T['enumValues']>) {
		super(name, 'string', 'PgEnumColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgEnumColumn<MakeColumnConfig<T, TTableName>> {
		return new PgEnumColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgEnumColumn<T extends ColumnBaseConfig<'string', 'PgEnumColumn'> & { enumValues: [string, ...string[]] }>
	extends PgColumn<T, { enum: PgEnum<T['enumValues']> }>
{
	static override readonly [entityKind]: string = 'PgEnumColumn';

	readonly enum = this.config.enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgEnumColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
): PgEnum<Writable<T>>;

export function pgEnum<E extends Record<string, string>>(
	enumName: string,
	enumObj: NonArray<E>,
): PgEnumObject<E>;

export function pgEnum(
	enumName: any,
	input: any,
): any {
	return Array.isArray(input)
		? pgEnumWithSchema(enumName, [...input] as [string, ...string[]], undefined)
		: pgEnumObjectWithSchema(enumName, input, undefined);
}

/** @internal */
export function pgEnumWithSchema<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
	schema?: string,
): PgEnum<Writable<T>> {
	const enumInstance: PgEnum<Writable<T>> = Object.assign(
		<TName extends string>(name?: TName): PgEnumColumnBuilderInitial<TName, Writable<T>> =>
			new PgEnumColumnBuilder(name ?? '' as TName, enumInstance),
		{
			enumName,
			enumValues: values,
			schema,
			[isPgEnumSym]: true,
		} as const,
	);

	return enumInstance;
}

/** @internal */
export function pgEnumObjectWithSchema<T extends object>(
	enumName: string,
	values: T,
	schema?: string,
): PgEnumObject<T> {
	const enumInstance: PgEnumObject<T> = Object.assign(
		<TName extends string>(name?: TName): PgEnumObjectColumnBuilderInitial<TName, T> =>
			new PgEnumObjectColumnBuilder(name ?? '' as TName, enumInstance),
		{
			enumName,
			enumValues: Object.values(values),
			schema,
			[isPgEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
