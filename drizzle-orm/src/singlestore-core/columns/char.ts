import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = SingleStoreCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreChar';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	generated: undefined;
	length: TLength;
}>;

export class SingleStoreCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'SingleStoreChar'> & { length?: number | undefined },
> extends SingleStoreColumnBuilder<
	T,
	SingleStoreCharConfig<T['enumValues'], T['length']>,
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'SingleStoreCharBuilder';

	constructor(name: T['name'], config: SingleStoreCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'SingleStoreChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new SingleStoreChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreChar<T extends ColumnBaseConfig<'string', 'SingleStoreChar'> & { length?: number | undefined }>
	extends SingleStoreColumn<T, SingleStoreCharConfig<T['enumValues'], T['length']>, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'SingleStoreChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface SingleStoreCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): SingleStoreCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: SingleStoreCharConfig<T | Writable<T>, L>,
): SingleStoreCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: SingleStoreCharConfig<T | Writable<T>, L>,
): SingleStoreCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | SingleStoreCharConfig, b: SingleStoreCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreCharConfig>(a, b);
	return new SingleStoreCharBuilder(name, config as any);
}
