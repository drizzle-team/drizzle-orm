import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreMediumIntBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number int24';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, SingleStoreIntConfig> {
	static override readonly [entityKind]: string = 'SingleStoreMediumIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, 'number int24', 'SingleStoreMediumInt');
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

export class SingleStoreMediumInt<T extends ColumnBaseConfig<'number int24'>>
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

export function mediumint(
	config?: SingleStoreIntConfig,
): SingleStoreMediumIntBuilder;
export function mediumint(
	name: string,
	config?: SingleStoreIntConfig,
): SingleStoreMediumIntBuilder;
export function mediumint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreMediumIntBuilder(name, config);
}
