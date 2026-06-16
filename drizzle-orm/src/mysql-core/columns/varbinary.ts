import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarBinaryBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarBinary';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarBinaryConfig>
{
	static readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	constructor(name: T['name'], config: MySqlVarBinaryConfig) {
		super(name, 'buffer', 'MySqlVarBinary');
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarBinary<T extends ColumnBaseConfig<'buffer', 'MySqlVarBinary'>>
	extends MySqlColumn<T, MySqlVarBinaryConfig>
{
	static readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarBinaryConfig {
	length?: number;
}

export function varbinary<TName extends string>(
	name: TName,
	config: MySqlVarBinaryConfig,
): MySqlVarBinaryBuilderInitial<TName> {
	return new MySqlVarBinaryBuilder(name, config);
}
