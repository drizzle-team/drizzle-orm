import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume, Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgEnumColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgEnumColumnBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgEnumColumnHKT;
}

export interface PgEnumColumnHKT extends ColumnHKTBase {
	_type: PgEnumColumn<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgEnumColumnBuilderInitial<TName extends string, TValues extends string[]> = PgEnumColumnBuilder<{
	name: TName;
	data: TValues[number];
	enum: TValues;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

const isPgEnumSym = Symbol('isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> {
	<TName extends string>(name: TName): PgEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: string[];
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj;
}

export class PgEnumColumnBuilder<T extends ColumnBuilderBaseConfig>
	extends PgColumnBuilder<PgEnumColumnBuilderHKT, T, { enumInstance: PgEnum<any> }>
{
	constructor(name: string, enumInstance: PgEnum<any>) {
		super(name);
		this.config.enumInstance = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgEnumColumn<MakeColumnConfig<T, TTableName>> {
		return new PgEnumColumn<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgEnumColumn<T extends ColumnBaseConfig> extends PgColumn<PgEnumColumnHKT, T> {
	readonly enum: PgEnum<any>;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgEnumColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.enum = config.enumInstance;
	}

	getSQLType(): string {
		return this.enum.enumName;
	}
}

// Gratitude to zod for the enum function types
export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	enumName: string,
	values: Writable<T>,
): PgEnum<Writable<T>> {
	const enumInstance = Object.assign(
		<TName extends string>(name: TName): PgEnumColumnBuilderInitial<TName, Writable<T>> =>
			new PgEnumColumnBuilder(name, enumInstance),
		{
			enumName,
			enumValues: values,
			[isPgEnumSym]: true,
		} as const,
	);

	return enumInstance;
}
