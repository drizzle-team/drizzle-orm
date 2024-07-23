import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreBsonBuilderInitial<TName extends string> = SingleStoreBsonBuilder<{
	name: TName;
	dataType: 'json'; // The bson is stored as a json string the same way binary is stored as a string (check `./binary.ts`)
	columnType: 'SingleStoreBson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'SingleStoreBson'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreBsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SingleStoreBson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBson<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBson<T extends ColumnBaseConfig<'json', 'SingleStoreBson'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreBson';

	getSQLType(): string {
		return 'bson';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function bson<TName extends string>(name: TName): SingleStoreBsonBuilderInitial<TName> {
	return new SingleStoreBsonBuilder(name);
}
