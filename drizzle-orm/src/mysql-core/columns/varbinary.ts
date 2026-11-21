import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarBinaryBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'MySqlVarBinary';
	data: Buffer;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'MySqlVarBinary'>>
	extends MySqlColumnBuilder<T, MySqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name, 'buffer', 'MySqlVarBinary');
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
	T extends ColumnBaseConfig<'buffer', 'MySqlVarBinary'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): Buffer {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string') return Buffer.from(value);
		if (value instanceof Uint8Array) return Buffer.from(value);

		throw new Error(`Invalid value for varbinary column: ${typeof value}`);
	}

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarbinaryOptions {
	length: number;
}

export function varbinary(
	config: MySqlVarbinaryOptions,
): MySqlVarBinaryBuilderInitial<''>;
export function varbinary<TName extends string>(
	name: TName,
	config: MySqlVarbinaryOptions,
): MySqlVarBinaryBuilderInitial<TName>;
export function varbinary(a?: string | MySqlVarbinaryOptions, b?: MySqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MySqlVarbinaryOptions>(a, b);
	return new MySqlVarBinaryBuilder(name, config);
}
