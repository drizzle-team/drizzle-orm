import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlVarBinaryBuilder extends MySqlColumnBuilder<{
	name: string;
	dataType: 'string varbinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: string, config: MySqlVarbinaryOptions) {
		super(name, 'string varbinary', 'MySqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlVarBinary(
			table,
			this.config as any,
		);
	}
}

export class MySqlVarBinary<
	T extends ColumnBaseConfig<'string varbinary'>,
> extends MySqlColumn<T, MySqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;

	override mapFromDriverValue(value: string | Buffer | Uint8Array): string {
		if (typeof value === 'string') return value;
		if (Buffer.isBuffer(value)) return value.toString();

		const str: string[] = [];
		for (const v of value) {
			str.push(v === 49 ? '1' : '0');
		}

		return str.join('');
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
): MySqlVarBinaryBuilder;
export function varbinary(
	name: string,
	config: MySqlVarbinaryOptions,
): MySqlVarBinaryBuilder;
export function varbinary(a?: string | MySqlVarbinaryOptions, b?: MySqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MySqlVarbinaryOptions>(a, b);
	return new MySqlVarBinaryBuilder(name, config);
}
