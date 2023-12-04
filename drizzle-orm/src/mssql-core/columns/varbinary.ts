import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlVarBinaryBuilderInitial<TName extends string> = MsSqlVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlVarBinary'>>
	extends MsSqlColumnBuilder<T, MsSqlVarbinaryOptions>
{
	static readonly [entityKind]: string = 'MsSqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MsSqlVarbinaryOptions) {
		super(name, 'string', 'MsSqlVarBinary');
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
	T extends ColumnBaseConfig<'string', 'MsSqlVarBinary'>,
> extends MsSqlColumn<T, MsSqlVarbinaryOptions> {
	static readonly [entityKind]: string = 'MsSqlVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MsSqlVarbinaryOptions {
	length: number;
}

export function varbinary<TName extends string>(
	name: TName,
	options: MsSqlVarbinaryOptions,
): MsSqlVarBinaryBuilderInitial<TName> {
	return new MsSqlVarBinaryBuilder(name, options);
}
