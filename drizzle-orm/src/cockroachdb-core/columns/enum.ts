import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

// Enum as ts enum

export type CockroachDbEnumObjectColumnBuilderInitial<TName extends string, TValues extends object> =
	CockroachDbEnumObjectColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachDbEnumObjectColumn';
		data: TValues[keyof TValues];
		enumValues: string[];
		driverParam: string;
	}>;

export interface CockroachDbEnumObject<TValues extends object> {
	(): CockroachDbEnumObjectColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): CockroachDbEnumObjectColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): CockroachDbEnumObjectColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachDbEnumSym]: true;
}

export class CockroachDbEnumObjectColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbEnumObjectColumn'> & { enumValues: string[] },
> extends CockroachDbColumnWithArrayBuilder<T, { enum: CockroachDbEnumObject<any> }> {
	static override readonly [entityKind]: string = 'CockroachDbEnumObjectColumnBuilder';

	constructor(name: T['name'], enumInstance: CockroachDbEnumObject<any>) {
		super(name, 'string', 'CockroachDbEnumObjectColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbEnumObjectColumn<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbEnumObjectColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbEnumObjectColumn<
	T extends ColumnBaseConfig<'string', 'CockroachDbEnumObjectColumn'> & { enumValues: object },
> extends CockroachDbColumn<T, { enum: CockroachDbEnumObject<object> }> {
	static override readonly [entityKind]: string = 'CockroachDbEnumObjectColumn';

	readonly enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbEnumObjectColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Enum as string union

export type CockroachDbEnumColumnBuilderInitial<TName extends string, TValues extends [string, ...string[]]> =
	CockroachDbEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachDbEnumColumn';
		data: TValues[number];
		enumValues: TValues;
		driverParam: string;
	}>;

const isCockroachDbEnumSym = Symbol.for('drizzle:isCockroachDbEnum');
export interface CockroachDbEnum<TValues extends [string, ...string[]]> {
	(): CockroachDbEnumColumnBuilderInitial<'', TValues>;
	<TName extends string>(name: TName): CockroachDbEnumColumnBuilderInitial<TName, TValues>;
	<TName extends string>(name?: TName): CockroachDbEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	readonly schema: string | undefined;
	/** @internal */
	[isCockroachDbEnumSym]: true;
}

export function isCockroachDbEnum(obj: unknown): obj is CockroachDbEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isCockroachDbEnumSym in obj && obj[isCockroachDbEnumSym] === true;
}

export class CockroachDbEnumColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbEnumColumn'> & { enumValues: [string, ...string[]] },
> extends CockroachDbColumnWithArrayBuilder<T, { enum: CockroachDbEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'CockroachDbEnumColumnBuilder';

	constructor(name: T['name'], enumInstance: CockroachDbEnum<T['enumValues']>) {
		super(name, 'string', 'CockroachDbEnumColumn');
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbEnumColumn<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbEnumColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbEnumColumn<
	T extends ColumnBaseConfig<'string', 'CockroachDbEnumColumn'> & { enumValues: [string, ...string[]] },
> extends CockroachDbColumn<T, { enum: CockroachDbEnum<T['enumValues']> }> {
	static override readonly [entityKind]: string = 'CockroachDbEnumColumn';

	readonly enum = this.config.enum;
	override readonly enumValues = this.config.enum.enumValues;

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbEnumColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

export function cockroachdbEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
): CockroachDbEnum<Writable<T>>;

export function cockroachdbEnum<E extends Record<string, string>>(
	enumName: string,
	enumObj: NonArray<E>,
): CockroachDbEnumObject<E>;

export function cockroachdbEnum(
	enumName: any,
	input: any,
): any {
	return Array.isArray(input)
		? cockroachdbEnumWithSchema(enumName, [...input] as [string, ...string[]], undefined)
		: cockroachdbEnumObjectWithSchema(enumName, input, undefined);
}

/** @internal */
export function cockroachdbEnumWithSchema<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
	schema?: string,
): CockroachDbEnum<Writable<T>> {
	const enumInstance: CockroachDbEnum<Writable<T>> = Object.assign(
		<TName extends string>(name?: TName): CockroachDbEnumColumnBuilderInitial<TName, Writable<T>> =>
			new CockroachDbEnumColumnBuilder(name ?? '' as TName, enumInstance),
		{
			enumName,
			enumValues: values,
			schema,
			[isCockroachDbEnumSym]: true,
		} as const,
	);

	return enumInstance;
}

/** @internal */
export function cockroachdbEnumObjectWithSchema<T extends object>(
	enumName: string,
	values: T,
	schema?: string,
): CockroachDbEnumObject<T> {
	const enumInstance: CockroachDbEnumObject<T> = Object.assign(
		<TName extends string>(name?: TName): CockroachDbEnumObjectColumnBuilderInitial<TName, T> =>
			new CockroachDbEnumObjectColumnBuilder(name ?? '' as TName, enumInstance),
		{
			enumName,
			enumValues: Object.values(values),
			schema,
			[isCockroachDbEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
