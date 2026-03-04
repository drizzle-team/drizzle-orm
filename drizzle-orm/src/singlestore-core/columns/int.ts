import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreIntBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number uint32' : 'number int32';
		data: number;
		driverParam: number | string;
	}, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, config?.unsigned ? 'number uint32' : 'number int32' as any, 'SingleStoreInt');
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

export class SingleStoreInt<T extends ColumnBaseConfig<'number int32' | 'number uint32'>>
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

export interface SingleStoreIntConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	unsigned?: TUnsigned;
}

export function int<TUnsigned extends boolean | undefined>(
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreIntBuilder<TUnsigned>;
export function int<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreIntBuilder<TUnsigned>;
export function int(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreIntBuilder(name, config);
}
