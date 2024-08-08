import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export type SingleStoreSmallIntBuilderInitial<TName extends string> = SingleStoreSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreSmallInt'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreIntConfig>
{
	static readonly [entityKind]: string = 'SingleStoreSmallIntBuilder';

	constructor(name: T['name'], config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreSmallInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreSmallInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreSmallInt<T extends ColumnBaseConfig<'number', 'SingleStoreSmallInt'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreIntConfig>
{
	static readonly [entityKind]: string = 'SingleStoreSmallInt';

	getSQLType(): string {
		return `smallint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TName extends string>(
	name: TName,
	config?: SingleStoreIntConfig,
): SingleStoreSmallIntBuilderInitial<TName> {
	return new SingleStoreSmallIntBuilder(name, config);
}
