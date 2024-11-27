import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgVarcharBuilderInitial<
	TName extends string,
	TLength extends number | undefined,
	TEnum extends [string, ...string[]],
> = PgVarcharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgVarchar';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class PgVarcharBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgVarchar'> & { length: number | undefined }>
	extends PgColumnBuilder<
		T,
		{ length: T['length']; enumValues: T['enumValues'] },
		{ length: T['length'] }
	>
{
	static override readonly [entityKind]: string = 'PgVarcharBuilder';

	constructor(name: T['name'], config: PgVarcharConfig<T['length'], T['enumValues']>) {
		super(name, 'string', 'PgVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new PgVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgVarchar<T extends ColumnBaseConfig<'string', 'PgVarchar'> & { length: number | undefined }>
	extends PgColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'PgVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface PgVarcharConfig<
	TLength extends number | undefined = number | undefined,
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	length?: TLength;
	enum?: TEnum;
}

export function varchar(): PgVarcharBuilderInitial<'', undefined, [string, ...string[]]>;
export function varchar<
	U extends string,
	L extends number | undefined,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: PgVarcharConfig<L, T | Writable<T>>,
): PgVarcharBuilderInitial<'', L, Writable<T>>;
export function varchar<
	TName extends string,
	L extends number | undefined,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: TName,
	config?: PgVarcharConfig<L, T | Writable<T>>,
): PgVarcharBuilderInitial<TName, L, Writable<T>>;
export function varchar(a?: string | PgVarcharConfig, b: PgVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgVarcharConfig>(a, b);
	return new PgVarcharBuilder(name, config as any);
}
