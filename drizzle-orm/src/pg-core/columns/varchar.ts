import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgVarcharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = PgVarcharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgVarchar';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	generated: undefined;
}>;

export class PgVarcharBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgVarchar'>> extends PgColumnBuilder<
	T,
	{ length: number | undefined; enumValues: T['enumValues'] }
> {
	static readonly [entityKind]: string = 'PgVarcharBuilder';

	constructor(name: T['name'], config: PgVarcharConfig<T['enumValues']>) {
		super(name, 'string', 'PgVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVarchar<MakeColumnConfig<T, TTableName>> {
		return new PgVarchar<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgVarchar<T extends ColumnBaseConfig<'string', 'PgVarchar'>>
	extends PgColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'PgVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface PgVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	length?: number;
	enum?: TEnum;
}

export function varchar(): PgVarcharBuilderInitial<'', [string, ...string[]]>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: PgVarcharConfig<T | Writable<T>>,
): PgVarcharBuilderInitial<'', Writable<T>>;
export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: PgVarcharConfig<T | Writable<T>>,
): PgVarcharBuilderInitial<TName, Writable<T>>;
export function varchar(a?: string | PgVarcharConfig, b: PgVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgVarcharConfig>(a, b);
	return new PgVarcharBuilder(name, config as any);
}
