import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import type { Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgChar';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	generated: undefined;
}>;

export class PgCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgChar'>> extends PgColumnBuilder<
	T,
	{ length: number | undefined; enumValues: T['enumValues'] }
> {
	static readonly [entityKind]: string = 'PgCharBuilder';

	constructor(name: string, config: PgCharConfig<T['enumValues']>) {
		super(name, 'string', 'PgChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgChar<MakeColumnConfig<T, TTableName>> {
		return new PgChar<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgChar<T extends ColumnBaseConfig<'string', 'PgChar'>>
	extends PgColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'PgChar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface PgCharConfig<TEnum extends readonly string[] | string[] | undefined> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: PgCharConfig<T | Writable<T>> = {},
): PgCharBuilderInitial<TName, Writable<T>> {
	return new PgCharBuilder(name, config);
}
