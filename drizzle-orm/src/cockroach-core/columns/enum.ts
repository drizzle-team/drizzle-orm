import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

// Enum as ts enum

export type CockroachEnumObjectColumnBuilderInitial<TName extends string, TValues extends object> =
	CockroachEnumObjectColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachEnumObjectColumn';
		data: TValues[keyof TValues];
		enumValues: string[];
		driverParam: string;
	}>;

export interface CockroachEnumObject<TValues extends object> {
	(): CockroachEnumObjectColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): CockroachEnumObjectColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): CockroachEnumObjectColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachEnumSym]: true;
}

export class CockroachEnumObjectColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachEnumObjectColumn'> & { enumValues: string[] },
> extends CockroachColumnWithArrayBuilder<T, { enum: CockroachEnumObject<any> }> {
	static override readonly [entityKind]: string = 'CockroachEnumObjectColumnBuilder';

	constructor(name: T['name'], enumInstance: CockroachEnumObject<any>) {
		super(name, 'string', 'CockroachEnumObjectColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachEnumObjectColumn<MakeColumnConfig<T, TTableName>> {
		return new CockroachEnumObjectColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachEnumObjectColumn<
	T extends ColumnBaseConfig<'string', 'CockroachEnumObjectColumn'> & { enumValues: object },
> extends CockroachColumn<T, { enum: CockroachEnumObject<object> }> {
	static override readonly [entityKind]: string = 'CockroachEnumObjectColumn';

	readonly enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
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

export type CockroachEnumColumnBuilderInitial<TName extends string, TValues extends [string, ...string[]]> =
	CockroachEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachEnumColumn';
		data: TValues[number];
		enumValues: TValues;
		driverParam: string;
	}>;

const isCockroachEnumSym = Symbol.for('drizzle:isCockroachEnum');
export interface CockroachEnum<TValues extends [string, ...string[]]> {
	(): CockroachEnumColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): CockroachEnumColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): CockroachEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachEnumSym]: true;
}

export function isCockroachEnum(obj: unknown): obj is CockroachEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isCockroachEnumSym in obj && obj[isCockroachEnumSym] === true;
}

export class CockroachEnumColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachEnumColumn'> & { enumValues: [string, ...string[]] },
> extends CockroachColumnWithArrayBuilder<T, { enum: CockroachEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'CockroachEnumColumnBuilder';

	constructor(name: T['name'], enumInstance: CockroachEnum<T['enumValues']>) {
		super(name, 'string', 'CockroachEnumColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachEnumColumn<MakeColumnConfig<T, TTableName>> {
		return new CockroachEnumColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachEnumColumn<
	T extends ColumnBaseConfig<'string', 'CockroachEnumColumn'> & { enumValues: [string, ...string[]] },
> extends CockroachColumn<T, { enum: CockroachEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'CockroachEnumColumn';

	readonly enum = this.config.enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachEnumColumnBuilder<T>['config'],
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
		<TName extends string>(name?: TName): CockroachEnumColumnBuilderInitial<TName, Writable<T>> =>
			new CockroachEnumColumnBuilder(name ?? '' as TName, enumInstance),
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
		<TName extends string>(name?: TName): CockroachEnumObjectColumnBuilderInitial<TName, T> =>
			new CockroachEnumObjectColumnBuilder(name ?? '' as TName, enumInstance),
		{
			enumName,
			enumValues: Object.values(values),
			schema,
			[isCockroachEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
