import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export class SingleStoreSmallIntBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}, SingleStoreIntConfig> {
	static override readonly [entityKind]: string = 'SingleStoreSmallIntBuilder';

	constructor(name: string, config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreSmallInt');
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

export class SingleStoreSmallInt<T extends ColumnBaseConfig<'number'>>
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

export function smallint(
	config?: SingleStoreIntConfig,
): SingleStoreSmallIntBuilder;
export function smallint(
	name: string,
	config?: SingleStoreIntConfig,
): SingleStoreSmallIntBuilder;
export function smallint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreSmallIntBuilder(name, config);
}
