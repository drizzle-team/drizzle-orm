import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	SingleStoreCharBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'SingleStoreChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
	}>;

export class SingleStoreCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreChar'>>
	extends SingleStoreColumnBuilder<
		T,
		SingleStoreCharConfig<T['enumValues']>
	>
{
	static readonly [entityKind]: string = 'SingleStoreCharBuilder';

	constructor(name: T['name'], config: SingleStoreCharConfig<T['enumValues']>) {
		super(name, 'string', 'SingleStoreChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new SingleStoreChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreChar<T extends ColumnBaseConfig<'string', 'SingleStoreChar'>>
	extends SingleStoreColumn<T, SingleStoreCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'SingleStoreChar';

	readonly length: number | undefined = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface SingleStoreCharConfig<TEnum extends readonly string[] | string[] | undefined> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreCharConfig<T | Writable<T>> = {},
): SingleStoreCharBuilderInitial<TName, Writable<T>> {
	return new SingleStoreCharBuilder(name, config);
}
