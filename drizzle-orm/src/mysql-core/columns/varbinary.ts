import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarbinaryBuilderInitial<TName extends string> = MySqlVarbinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarbinary';
	data: Buffer;
	driverParam: Buffer | string;
	enumValues: undefined;
}>;

export class MySqlVarbinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlVarbinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static readonly [entityKind]: string = 'MySqlVarbinaryBuilder';

	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'buffer', 'MySqlVarbinary');
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarbinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarbinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarbinary<T extends ColumnBaseConfig<'buffer', 'MySqlVarbinary'>>
	extends MySqlColumn<T, MySqlVarbinaryOptions>
{
	static readonly [entityKind]: string = 'MySqlVarbinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}

	override mapFromDriverValue(value: Buffer | string): Buffer {
		if (typeof value === 'string') {
			return Buffer.from(value);
		}
		return value;
	}
}

export interface MySqlVarbinaryOptions {
	length?: number;
}

export function varbinary<TName extends string>(
	name: TName,
	options: MySqlVarbinaryOptions,
): MySqlVarbinaryBuilderInitial<TName>;
export function varbinary(name: string, options: MySqlVarbinaryOptions) {
	return new MySqlVarbinaryBuilder(name, options);
}
