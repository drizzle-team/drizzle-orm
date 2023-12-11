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
		generated: undefined;
	}>;

const isPgEnumSym = Symbol.for('drizzle:isPgEnum');
export interface PgEnum<TValues extends [string, ...string[]]> {
	<TName extends string>(name: TName): PgEnumColumnBuilderInitial<TName, TValues>;

	readonly enumName: string;
	readonly enumValues: TValues;
	/** @internal */
	[isPgEnumSym]: true;
}

export function isPgEnum(obj: unknown): obj is PgEnum<[string, ...string[]]> {
	return !!obj && typeof obj === 'function' && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}

export class PgEnumColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgEnumColumn'> & { enumValues: [string, ...string[]] },
> extends PgColumnBuilder<T, { enum: PgEnum<T['enumValues']> }> {
	static readonly [entityKind]: string = 'PgEnumColumnBuilder';

	constructor(name: string, enumInstance: PgEnum<T['enumValues']>) {
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
	static readonly [entityKind]: string = 'PgEnumColumn';

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
