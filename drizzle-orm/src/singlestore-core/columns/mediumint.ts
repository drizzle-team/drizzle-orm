import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreMediumIntBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number uint24' : 'number int24';
		data: number;
		driverParam: number | string;
	}, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreMediumIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, config?.unsigned ? 'number uint24' : 'number int24' as any, 'SingleStoreMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreMediumInt(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreMediumInt<T extends ColumnBaseConfig<'number int24' | 'number uint24'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreMediumInt';

	getSQLType(): string {
		return `mediumint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function mediumint<TUnsigned extends boolean | undefined>(
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreMediumIntBuilder<TUnsigned>;
export function mediumint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreMediumIntBuilder<TUnsigned>;
export function mediumint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreMediumIntBuilder(name, config);
}
