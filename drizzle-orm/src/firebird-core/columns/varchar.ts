import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdVarcharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = FirebirdVarcharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdVarchar';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class FirebirdVarcharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'FirebirdVarchar'> & { length?: number | undefined },
> extends FirebirdColumnBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'FirebirdVarcharBuilder';

	constructor(name: T['name'], config: FirebirdVarcharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'FirebirdVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new FirebirdVarchar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdVarchar<T extends ColumnBaseConfig<'string', 'FirebirdVarchar'> & { length?: number | undefined }>
	extends FirebirdColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'FirebirdVarchar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface FirebirdVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function varchar(): FirebirdVarcharBuilderInitial<'', [string, ...string[]], undefined>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	config?: FirebirdVarcharConfig<T | Writable<T>, L>,
): FirebirdVarcharBuilderInitial<'', Writable<T>, L>;
export function varchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: FirebirdVarcharConfig<T | Writable<T>, L>,
): FirebirdVarcharBuilderInitial<TName, Writable<T>, L>;
export function varchar(a?: string | FirebirdVarcharConfig, b: FirebirdVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<FirebirdVarcharConfig>(a, b);
	return new FirebirdVarcharBuilder(name, config as any);
}
