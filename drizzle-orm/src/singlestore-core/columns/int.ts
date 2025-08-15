import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreIntBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number int32';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, SingleStoreIntConfig> {
	static override readonly [entityKind]: string = 'SingleStoreIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, 'number int32', 'SingleStoreInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreInt(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreInt<T extends ColumnBaseConfig<'number int32'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreInt';

	getSQLType(): string {
		return `int${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export interface SingleStoreIntConfig {
	unsigned?: boolean;
}

export function int(): SingleStoreIntBuilder;
export function int(
	config?: SingleStoreIntConfig,
): SingleStoreIntBuilder;
export function int(
	name: string,
	config?: SingleStoreIntConfig,
): SingleStoreIntBuilder;
export function int(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreIntBuilder(name, config);
}
