import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarBinaryBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlVarBinary';
		data: string;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'string', 'MySqlVarBinary');
		this.config.length = config?.length;
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

export class MySqlVarBinary<
	T extends ColumnBaseConfig<'string', 'MySqlVarBinary'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarbinaryOptions {
	length: number;
}

export function varbinary<TName extends string>(
	name: TName,
	options: MySqlVarbinaryOptions,
): MySqlVarBinaryBuilderInitial<TName> {
	return new MySqlVarBinaryBuilder(name, options);
}
