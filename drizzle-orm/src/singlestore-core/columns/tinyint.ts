import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreTinyIntBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number int8';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, SingleStoreIntConfig> {
	static override readonly [entityKind]: string = 'SingleStoreTinyIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, 'number int8', 'SingleStoreTinyInt');
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

export class SingleStoreTinyInt<T extends ColumnBaseConfig<'number int8'>>
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

export function tinyint(
	config?: SingleStoreIntConfig,
): SingleStoreTinyIntBuilder;
export function tinyint(
	name: string,
	config?: SingleStoreIntConfig,
): SingleStoreTinyIntBuilder;
export function tinyint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreTinyIntBuilder(name, config);
}
