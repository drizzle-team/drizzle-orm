import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume, type Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgEnumColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgEnumColumnBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: PgEnumColumnHKT;
}

export interface PgEnumColumnHKT extends ColumnHKTBase {
	_type: PgEnumColumn<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type PgEnumColumnBuilderInitial<TName extends string, TValues extends [string, ...string[]]> =
	PgEnumColumnBuilder<{
		name: TName;
		data: TValues[number];
		enumValues: TValues;
		driverParam: string;
		notNull: false;
		hasDefault: false;
	}>;

const isPgEnumSym = Symbol.for('drizzle:isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> extends WithEnum<TValues> {
	<TName extends string>(name: TName): PgEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj;
}

export class PgEnumColumnBuilder<T extends ColumnBuilderBaseConfig & WithEnum>
	extends PgColumnBuilder<PgEnumColumnBuilderHKT, T, { enum: PgEnum<T['enumValues']> }>
{
	static readonly [entityKind]: string = 'PgEnumColumnBuilder';

	constructor(name: string, enumInstance: PgEnum<T['enumValues']>) {
		super(name);
		this.config.enum = enumInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgEnumColumn<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>> {
		return new PgEnumColumn<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>>(table, this.config);
	}
}

export class PgEnumColumn<T extends ColumnBaseConfig & WithEnum>
	extends PgColumn<PgEnumColumnHKT, T, { enum: PgEnum<T['enumValues']> }>
	implements WithEnum<T['enumValues']>
{
	static readonly [entityKind]: string = 'PgEnumColumn';

	readonly enum = this.config.enum;
	readonly enumValues = this.config.enum.enumValues;

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
