import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume, Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgCharHKT;
}

export interface PgCharHKT extends ColumnHKTBase {
	_type: PgChar<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgCharBuilderInitial<TName extends string, TEnum extends string[]> = PgCharBuilder<{
	name: TName;
	data: TEnum[number];
	enum: TEnum;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgCharBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgCharBuilderHKT,
	T,
	{ length: number | undefined; enum: string[] }
> {
	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgChar<MakeColumnConfig<T, TTableName>> {
		return new PgChar<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgChar<T extends ColumnBaseConfig> extends PgColumn<PgCharHKT, T> {
	readonly length: number | undefined;
	readonly enum: string[];

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgCharBuilder<T>['config']) {
		super(table, config);
		this.length = config.length;
		this.enum = config.enum ?? [];
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `char(${this.length})` : `char`;
	}
}

export interface PgCharConfig<TEnum extends string[]> {
	length?: number;
	enum?: TEnum;
}

export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(name: TName, config: PgCharConfig<Writable<T>> = {}): PgCharBuilderInitial<TName, Writable<T>> {
	return new PgCharBuilder(name, config.length);
}
