import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

// Enum as ts enum
export interface CockroachEnumObject<TValues extends object> {
	(name?: string): CockroachEnumObjectColumnBuilder<TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachEnumSym]: true;
}

export class CockroachEnumObjectColumnBuilder<TValues extends object> extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'string enum';
		data: TValues[keyof TValues];
		enumValues: string[];
		driverParam: string;
	},
	{ enum: CockroachEnumObject<any> }
> {
	static override readonly [entityKind]: string = 'CockroachEnumObjectColumnBuilder';

	constructor(name: string, enumInstance: CockroachEnumObject<any>) {
		super(name, 'string enum', 'CockroachEnumObjectColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachEnumObjectColumn(
			table,
			this.config,
		);
	}
}

export class CockroachEnumObjectColumn<
	T extends ColumnBaseConfig<'string enum'> & { enumValues: object },
> extends CockroachColumn<T, { enum: CockroachEnumObject<object> }> {
	static override readonly [entityKind]: string = 'CockroachEnumObjectColumn';

	readonly enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: CockroachTable<any>,
		config: CockroachEnumObjectColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Enum as string union
const isCockroachEnumSym = Symbol.for('drizzle:isCockroachEnum');
export interface CockroachEnum<TValues extends [string, ...string[]]> {
	(name?: string): CockroachEnumColumnBuilder<TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachEnumSym]: true;
}

export function isCockroachEnum(obj: unknown): obj is CockroachEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isCockroachEnumSym in obj && obj[isCockroachEnumSym] === true;
}

export class CockroachEnumColumnBuilder<TValues extends [string, ...string[]]> extends CockroachColumnWithArrayBuilder<{
	dataType: 'string';
	data: TValues[number];
	enumValues: TValues;
	driverParam: string;
}, { enum: CockroachEnum<TValues> }> {
	static override readonly [entityKind]: string = 'CockroachEnumColumnBuilder';

	constructor(name: string, enumInstance: CockroachEnum<TValues>) {
		super(name, 'string enum', 'CockroachEnumColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachEnumColumn(
			table,
			this.config,
		);
	}
}

export class CockroachEnumColumn<
	T extends ColumnBaseConfig<'string enum'> & { enumValues: [string, ...string[]] },
> extends CockroachColumn<T, { enum: CockroachEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'CockroachEnumColumn';

	readonly enum = this.config.enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: CockroachTable<any>,
		config: CockroachEnumColumnBuilder<T['enumValues']>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

export function cockroachEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
): CockroachEnum<Writable<T>>;

export function cockroachEnum<E extends Record<string, string>>(
	enumName: string,
	enumObj: NonArray<E>,
): CockroachEnumObject<E>;

export function cockroachEnum(
	enumName: any,
	input: any,
): any {
	return Array.isArray(input)
		? cockroachEnumWithSchema(enumName, [...input] as [string, ...string[]], undefined)
		: cockroachEnumObjectWithSchema(enumName, input, undefined);
}

/** @internal */
export function cockroachEnumWithSchema<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
	schema?: string,
): CockroachEnum<Writable<T>> {
	const enumInstance: CockroachEnum<Writable<T>> = Object.assign(
		(name?: string): CockroachEnumColumnBuilder<Writable<T>> =>
			new CockroachEnumColumnBuilder(name ?? '', enumInstance),
		{
			enumName,
			enumValues: values,
			schema,
			[isCockroachEnumSym]: true,
		} as const,
	);

	return enumInstance;
}

/** @internal */
export function cockroachEnumObjectWithSchema<T extends object>(
	enumName: string,
	values: T,
	schema?: string,
): CockroachEnumObject<T> {
	const enumInstance: CockroachEnumObject<T> = Object.assign(
		(name?: string): CockroachEnumObjectColumnBuilder<T> =>
			new CockroachEnumObjectColumnBuilder(name ?? '', enumInstance),
		{
			enumName,
			enumValues: Object.values(values),
			schema,
			[isCockroachEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
