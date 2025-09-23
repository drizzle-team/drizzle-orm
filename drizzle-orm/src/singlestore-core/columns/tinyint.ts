import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreTinyIntBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number uint8' : 'number int8';
		data: number;
		driverParam: number | string;
	}, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTinyIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, config?.unsigned ? 'number uint8' : 'number int8' as any, 'SingleStoreTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreTinyInt(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreTinyInt<T extends ColumnBaseConfig<'number int8' | 'number uint8'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTinyInt';

	getSQLType(): string {
		return `tinyint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint<TUnsigned extends boolean | undefined>(
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreTinyIntBuilder<TUnsigned>;
export function tinyint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreIntConfig<TUnsigned>,
): SingleStoreTinyIntBuilder<TUnsigned>;
export function tinyint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreTinyIntBuilder(name, config);
}
