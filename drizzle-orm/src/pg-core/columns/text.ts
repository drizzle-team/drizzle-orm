import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';

import type { Assume, Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig & PgTextBuilderConfig>>;
	_columnHKT: PgTextHKT;
}

export interface PgTextHKT extends ColumnHKTBase {
	_type: PgText<Assume<this['config'], ColumnBaseConfig>>;
}

export interface PgTextBuilderConfig {
	enum: string[];
}

type PgTextBuilderInitial<TName extends string, TEnum extends string[]> = PgTextBuilder<{
	name: TName;
	data: TEnum[number];
	enum: TEnum;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgTextBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgTextBuilderHKT,
	T,
	{ enum: string[] }
> {
	constructor(
		name: T['name'],
		config: PgTextConfig<string[]>,
	) {
		super(name);
		this.config.enum = config.enum ?? [];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgText<MakeColumnConfig<T, TTableName>> {
		return new PgText<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgText<T extends ColumnBaseConfig> extends PgColumn<PgTextHKT, T> {
	readonly enum: string[];

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgTextBuilder<any>['config'],
	) {
		super(table, config);
		this.enum = config.enum;
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface PgTextConfig<TEnum extends string[]> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: PgTextConfig<Writable<T>> = {},
): PgTextBuilderInitial<TName, Writable<T>> {
	return new PgTextBuilder(name, config);
}
