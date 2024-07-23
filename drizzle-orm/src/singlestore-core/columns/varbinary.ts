import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVarBinaryBuilderInitial<TName extends string> = SingleStoreVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreVarBinary'>>
	extends SingleStoreColumnBuilder<T, SingleStoreVarbinaryOptions>
{
	static readonly [entityKind]: string = 'SingleStoreVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarbinaryOptions) {
		super(name, 'string', 'SingleStoreVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreVarBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreVarBinary<
	T extends ColumnBaseConfig<'string', 'SingleStoreVarBinary'>,
> extends SingleStoreColumn<T, SingleStoreVarbinaryOptions> {
	static readonly [entityKind]: string = 'SingleStoreVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface SingleStoreVarbinaryOptions {
	length: number;
}

export function varbinary<TName extends string>(
	name: TName,
	options: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilderInitial<TName> {
	return new SingleStoreVarBinaryBuilder(name, options);
}
