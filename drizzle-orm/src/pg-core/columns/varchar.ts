import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume, Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgVarcharBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgVarcharBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: PgVarcharHKT;
}

export interface PgVarcharHKT extends ColumnHKTBase {
	_type: PgVarchar<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type PgVarcharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgVarcharBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class PgVarcharBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends PgColumnBuilder<
	PgVarcharBuilderHKT,
	T,
	{ length: number | undefined } & WithEnum<T['enumValues']>
> {
	constructor(name: string, config: PgVarcharConfig<T['enumValues']>) {
		super(name);
		this.config.length = config.length;
		this.config.enumValues = (config.enum ?? []) as T['enumValues'];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVarchar<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>> {
		return new PgVarchar<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>>(table, this.config);
	}
}

export class PgVarchar<T extends ColumnBaseConfig & WithEnum>
	extends PgColumn<PgVarcharHKT, T, { length: number | undefined } & WithEnum<T['enumValues']>>
	implements WithEnum<T['enumValues']>
{
	readonly length = this.config.length;
	readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export interface PgVarcharConfig<TEnum extends readonly string[] | string[]> {
	length?: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: PgVarcharConfig<T | Writable<T>> = {},
): PgVarcharBuilderInitial<TName, Writable<T>> {
	return new PgVarcharBuilder(name, config);
}
