import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume, Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgVarcharBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgVarcharBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgVarcharHKT;
}

export interface PgVarcharHKT extends ColumnHKTBase {
	_type: PgVarchar<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgVarcharBuilderInitial<TName extends string, TEnum extends string[]> = PgVarcharBuilder<{
	name: TName;
	data: TEnum[number];
	driverParam: string;
	enum: TEnum;
	notNull: false;
	hasDefault: false;
}>;

export class PgVarcharBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgVarcharBuilderHKT,
	T,
	{ length: number | undefined; enum: string[] }
> {
	constructor(name: string, config: PgVarcharConfig<string[]>) {
		super(name);
		this.config.length = config.length;
		this.config.enum = config.enum ?? [];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVarchar<MakeColumnConfig<T, TTableName>> {
		return new PgVarchar<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgVarchar<T extends ColumnBaseConfig> extends PgColumn<PgVarcharHKT, T> {
	readonly length: number | undefined;
	readonly enum: string[];

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgVarcharBuilder<T>['config']) {
		super(table, config);
		this.length = config.length;
		this.enum = config.enum;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `varchar(${this.length})` : `varchar`;
	}
}

export interface PgVarcharConfig<TEnum extends string[]> {
	length?: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config: PgVarcharConfig<Writable<T>> = {},
): PgVarcharBuilderInitial<TName, Writable<T>> {
	return new PgVarcharBuilder(name, config);
}
