import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreVarBinaryBuilder extends SingleStoreColumnBuilder<{
	dataType: 'string binary';
	data: string;
	driverParam: string;
}, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinaryBuilder';

	/** @internal */
	constructor(name: string, config: SingleStoreVarbinaryOptions) {
		super(name, 'string binary', 'SingleStoreVarBinary');
		this.config.length = config.length;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreVarBinary(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreVarBinary<
	T extends ColumnBaseConfig<'string binary'>,
> extends SingleStoreColumn<T, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinary';

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

export interface SingleStoreVarbinaryOptions {
	length: number;
}

export function varbinary(
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilder;
export function varbinary(
	name: string,
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilder;
export function varbinary(a?: string | SingleStoreVarbinaryOptions, b?: SingleStoreVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarbinaryOptions>(a, b);
	return new SingleStoreVarBinaryBuilder(name, config);
}
