import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/tables/common.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreFloatBuilderInitial<TName extends string> = SingleStoreFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreFloat';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreFloat'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'SingleStoreFloatBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SingleStoreFloat');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreFloat<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreFloat<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreFloat<T extends ColumnBaseConfig<'number', 'SingleStoreFloat'>>
	extends SingleStoreColumnWithAutoIncrement<T>
{
	static readonly [entityKind]: string = 'SingleStoreFloat';

	getSQLType(): string {
		return 'float';
	}
}

export function float<TName extends string>(name: TName): SingleStoreFloatBuilderInitial<TName> {
	return new SingleStoreFloatBuilder(name);
}
