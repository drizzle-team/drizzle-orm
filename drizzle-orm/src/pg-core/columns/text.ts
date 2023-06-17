import type { ColumnBaseConfig, ColumnHKTBase, WithEnum } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume, type Writable } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgTextBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgTextBuilder<Assume<this['config'], ColumnBuilderBaseConfig & WithEnum>>;
	_columnHKT: PgTextHKT;
}

export interface PgTextHKT extends ColumnHKTBase {
	_type: PgText<Assume<this['config'], ColumnBaseConfig & WithEnum>>;
}

type PgTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgTextBuilder<{
	name: TName;
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgTextBuilder<T extends ColumnBuilderBaseConfig & WithEnum> extends PgColumnBuilder<
	PgTextBuilderHKT,
	T,
	WithEnum<T['enumValues']>
> {
	static readonly [entityKind]: string = 'PgTextBuilder';

	constructor(
		name: T['name'],
		config: PgTextConfig<T['enumValues']>,
	) {
		super(name);
		this.config.enumValues = (config.enum ?? []) as T['enumValues'];
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgText<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>> {
		return new PgText<MakeColumnConfig<T, TTableName> & WithEnum<T['enumValues']>>(table, this.config);
	}
}

export class PgText<T extends ColumnBaseConfig & WithEnum> extends PgColumn<PgTextHKT, T, WithEnum<T['enumValues']>>
	implements WithEnum<T['enumValues']>
{
	static readonly [entityKind]: string = 'PgText';

	readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export interface PgTextConfig<TEnum extends readonly string[] | string[]> {
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: PgTextConfig<T | Writable<T>> = {},
): PgTextBuilderInitial<TName, Writable<T>> {
	return new PgTextBuilder(name, config);
}
