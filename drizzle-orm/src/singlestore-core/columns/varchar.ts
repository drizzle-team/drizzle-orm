import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVarCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	SingleStoreVarCharBuilder<
		{
			name: TName;
			dataType: 'string';
			columnType: 'SingleStoreVarChar';
			data: TEnum[number];
			driverParam: number | string;
			enumValues: TEnum;
			generated: undefined;
		}
	>;

export class SingleStoreVarCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreVarChar'>>
	extends SingleStoreColumnBuilder<T, SingleStoreVarCharConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'SingleStoreVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarCharConfig<T['enumValues']>) {
		super(name, 'string', 'SingleStoreVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new SingleStoreVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreVarChar<T extends ColumnBaseConfig<'string', 'SingleStoreVarChar'>>
	extends SingleStoreColumn<T, SingleStoreVarCharConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'SingleStoreVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface SingleStoreVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> {
	length: number;
	enum?: TEnum;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: SingleStoreVarCharConfig<T | Writable<T>>,
): SingleStoreVarCharBuilderInitial<'', Writable<T>>;
export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SingleStoreVarCharConfig<T | Writable<T>>,
): SingleStoreVarCharBuilderInitial<TName, Writable<T>>;
export function varchar(a?: string | SingleStoreVarCharConfig, b?: SingleStoreVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarCharConfig>(a, b);
	return new SingleStoreVarCharBuilder(name, config as any);
}
