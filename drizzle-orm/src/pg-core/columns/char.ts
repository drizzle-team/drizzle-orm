import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume, type Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgCharBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgCharBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: PgCharHKT;
}

export interface PgCharHKT extends ColumnHKTBase {
	_type: PgChar<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

export type PgCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgCharBuilder<{
	name: TName;
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgCharBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends PgColumnBuilder<
	PgCharBuilderHKT,
	T,
	{ length: number | undefined } & WithEnum<T['enumValues']>
> {
	static readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<T['enumValues']>) {
		super(name);
		this.config.length = config.length;
		this.config.enumValues = (config.enum ?? []) as T['enumValues'];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgChar<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>> {
		return new PgChar<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>>(table, this.config);
	}
}

export class PgChar<T extends ColumnBaseConfig & WithEnum>
	extends PgColumn<PgCharHKT, T, { length: number | undefined } & WithEnum<T['enumValues']>>
{
	static readonly [entityKind]: string = 'PgChar';

	readonly length = this.config.length;
	readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface PgCharConfig<TEnum extends readonly string[] | string[]> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: PgCharConfig<T | Writable<T>> = {},
): PgCharBuilderInitial<TName, Writable<T>> {
	return new PgCharBuilder(name, config);
}
