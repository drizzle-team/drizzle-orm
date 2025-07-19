import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export type SingleStoreTinyIntBuilderInitial<TName extends string> = SingleStoreTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTinyIntBuilder';

	constructor(name: T['name'], config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreTinyInt');
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

export class SingleStoreTinyInt<T extends ColumnBaseConfig<'number'>>
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

export function tinyint(): SingleStoreTinyIntBuilderInitial<''>;
export function tinyint(
	config?: SingleStoreIntConfig,
): SingleStoreTinyIntBuilderInitial<''>;
export function tinyint<TName extends string>(
	name: TName,
	config?: SingleStoreIntConfig,
): SingleStoreTinyIntBuilderInitial<TName>;
export function tinyint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreTinyIntBuilder(name, config);
}
