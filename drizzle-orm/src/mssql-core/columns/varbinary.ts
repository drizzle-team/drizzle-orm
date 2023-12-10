import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlVarBinaryBuilderInitial<TName extends string> = MsSqlVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MsSqlVarBinary';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class MsSqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MsSqlVarBinary'>>
	extends MsSqlColumnBuilder<T, MsSqlVarbinaryOptions>
{
	static readonly [entityKind]: string = 'MsSqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MsSqlVarbinaryOptions) {
		super(name, 'buffer', 'MsSqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlVarBinary<MakeColumnConfig<T, TTableName>> {
		return new MsSqlVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlVarBinary<
	T extends ColumnBaseConfig<'buffer', 'MsSqlVarBinary'>,
> extends MsSqlColumn<T, MsSqlVarbinaryOptions> {
	static readonly [entityKind]: string = 'MsSqlVarBinary';

	length: number | 'max' | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MsSqlVarbinaryOptions {
	length: number | 'max';
}

export function varbinary<TName extends string>(
	name: TName,
	options: MsSqlVarbinaryOptions,
): MsSqlVarBinaryBuilderInitial<TName> {
	return new MsSqlVarBinaryBuilder(name, options);
}
