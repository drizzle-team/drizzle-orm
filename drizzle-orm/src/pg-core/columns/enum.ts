import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import type { Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

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

	readonly $inferValues: TValues[number];
	readonly enum: { [K in TValues[number]]: K };
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

// Gratitude to zod for the enum function types
export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: T | Writable<T>,
): PgEnum<Writable<T>> {
	return pgEnumWithSchema(enumName, values, undefined);
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
			get enum(): { [K in T[number]]: K } {
				const enumObj: Record<string, string> = {};
				for (const value of values) {
					enumObj[value] = value;
				}
				return enumObj as any;
			},
			$inferValues: undefined as any
		} as const,
	);

	return enumInstance;
}

export type InferEnumValues<T extends PgEnum<any>> = T['$inferValues'];
