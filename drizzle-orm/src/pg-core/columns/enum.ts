import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// Enum as ts enum
export interface PgEnumObject<TValues extends object> {
	(name?: string): PgEnumObjectColumnBuilder<TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	readonly schema: string | undefined;
	/** @internal */
	[isPgEnumSym]: true;
}

export class PgEnumObjectColumnBuilder<
	TValues extends object,
> extends PgColumnBuilder<{
	dataType: 'string enum';
	data: TValues[keyof TValues];
	enumValues: string[];
	driverParam: string;
}, { enum: PgEnumObject<any> }> {
	static override readonly [entityKind]: string = 'PgEnumObjectColumnBuilder';

	constructor(name: string, enumInstance: PgEnumObject<any>) {
		super(name, 'string enum', 'PgEnumObjectColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgEnumObjectColumn(
			table,
			this.config as any,
		);
	}
}

export class PgEnumObjectColumn<TValues extends object> extends PgColumn<'string enum'> {
	static override readonly [entityKind]: string = 'PgEnumObjectColumn';

	readonly enum: PgEnumObject<TValues>;
	override readonly enumValues: string[];

	constructor(
		table: PgTable<any>,
		config: PgEnumObjectColumnBuilder<TValues>['config'],
	) {
		super(table, config as any);
		this.enum = config.enum as PgEnumObject<TValues>;
		this.enumValues = config.enum.enumValues;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Enum as string union

const isPgEnumSym = Symbol.for('drizzle:isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> {
	(name?: string): PgEnumColumnBuilder<TValues>;

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
	TValues extends [string, ...string[]],
> extends PgColumnBuilder<{
	dataType: 'string enum';
	data: TValues[number];
	enumValues: TValues;
	driverParam: string;
}, { enum: PgEnum<TValues> }> {
	static override readonly [entityKind]: string = 'PgEnumColumnBuilder';

	constructor(name: string, enumInstance: PgEnum<TValues>) {
		super(name, 'string enum', 'PgEnumColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgEnumColumn(
			table,
			this.config as any,
		);
	}
}

export class PgEnumColumn<TValues extends [string, ...string[]]> extends PgColumn<'string enum'> {
	static override readonly [entityKind]: string = 'PgEnumColumn';

	readonly enum: PgEnum<TValues>;
	override readonly enumValues: TValues;

	constructor(
		table: PgTable<any>,
		config: PgEnumColumnBuilder<TValues>['config'],
	) {
		super(table, config as any);
		this.enum = config.enum;
		this.enumValues = config.enum.enumValues;
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
		(name?: string): PgEnumColumnBuilder<Writable<T>> => new PgEnumColumnBuilder(name ?? '', enumInstance),
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
		(name?: string): PgEnumObjectColumnBuilder<T> => new PgEnumObjectColumnBuilder(name ?? '', enumInstance),
		{
			enumName,
			enumValues: Object.values(values),
			schema,
			[isPgEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
