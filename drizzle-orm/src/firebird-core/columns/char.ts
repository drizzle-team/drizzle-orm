import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = FirebirdCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdChar';
	data: TEnum[number];
	enumValues: TEnum;
	driverParam: string;
	length: TLength;
}>;

export class FirebirdCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'FirebirdChar'> & { length?: number | undefined }>
	extends FirebirdColumnBuilder<
		T,
		{ length: T['length']; enumValues: T['enumValues'] },
		{ length: T['length'] }
	>
{
	static override readonly [entityKind]: string = 'FirebirdCharBuilder';

	constructor(name: T['name'], config: FirebirdCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'FirebirdChar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new FirebirdChar<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdChar<T extends ColumnBaseConfig<'string', 'FirebirdChar'> & { length?: number | undefined }>
	extends FirebirdColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'FirebirdChar';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface FirebirdCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): FirebirdCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: FirebirdCharConfig<T | Writable<T>, L>,
): FirebirdCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: FirebirdCharConfig<T | Writable<T>, L>,
): FirebirdCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | FirebirdCharConfig, b: FirebirdCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<FirebirdCharConfig>(a, b);
	return new FirebirdCharBuilder(name, config as any);
}
