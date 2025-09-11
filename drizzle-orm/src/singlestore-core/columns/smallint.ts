import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreSmallIntBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number uint16' : 'number int16';
		data: number;
		driverParam: number | string;
	}, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreSmallIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, config?.unsigned ? 'number uint16' : 'number int16' as any, 'SingleStoreSmallInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreSmallInt(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreSmallInt<T extends ColumnBaseConfig<'number int16' | 'number uint16'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreSmallInt';

	getSQLType(): string {
		return `smallint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint<TUnsigned extends boolean | undefined>(
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreSmallIntBuilder<TUnsigned>;
export function smallint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreSmallIntBuilder<TUnsigned>;
export function smallint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreSmallIntBuilder(name, config);
}
