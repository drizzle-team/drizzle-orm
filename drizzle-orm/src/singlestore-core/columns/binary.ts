import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreBinaryBuilder extends SingleStoreColumnBuilder<
	{
		dataType: 'string binary';
		data: string;
		driverParam: string;
	},
	SingleStoreBinaryConfig & { setLength: boolean }
> {
	static override readonly [entityKind]: string = 'SingleStoreBinaryBuilder';

	constructor(name: string, length: number | undefined) {
		super(name, 'string binary', 'SingleStoreBinary');
		this.config.length = length ?? 1;
		this.config.setLength = length !== undefined;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreBinary(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreBinary<T extends ColumnBaseConfig<'string binary'>> extends SingleStoreColumn<
	T,
	SingleStoreBinaryConfig & { setLength: boolean }
> {
	static override readonly [entityKind]: string = 'SingleStoreBinary';

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
		return this.config.setLength ? `binary(${this.length})` : `binary`;
	}
}

export interface SingleStoreBinaryConfig {
	length?: number;
}

export function binary(
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilder;
export function binary(
	name: string,
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilder;
export function binary(a?: string | SingleStoreBinaryConfig, b: SingleStoreBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBinaryConfig>(a, b);
	return new SingleStoreBinaryBuilder(name, config.length);
}
