import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlBinaryBuilder extends MySqlColumnBuilder<
	{
		name: string;
		dataType: 'string';
		data: string;
		driverParam: string;
		enumValues: undefined;
	},
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinaryBuilder';

	constructor(name: string, length: number | undefined) {
		super(name, 'string', 'MySqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBinary(table, this.config as any);
	}
}

export class MySqlBinary<T extends ColumnBaseConfig<'string'>> extends MySqlColumn<
	T,
	MySqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'MySqlBinary';

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
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface MySqlBinaryConfig {
	length?: number;
}

export function binary(
	config?: MySqlBinaryConfig,
): MySqlBinaryBuilder;
export function binary(
	name: string,
	config?: MySqlBinaryConfig,
): MySqlBinaryBuilder;
export function binary(a?: string | MySqlBinaryConfig, b: MySqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlBinaryConfig>(a, b);
	return new MySqlBinaryBuilder(name, config.length);
}
