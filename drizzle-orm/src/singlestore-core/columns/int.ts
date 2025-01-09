import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreIntBuilderInitial<TName extends string> = SingleStoreIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreInt'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreIntBuilder';

	constructor(name: T['name'], config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreInt<T extends ColumnBaseConfig<'number', 'SingleStoreInt'>>
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

export function int(): SingleStoreIntBuilderInitial<''>;
export function int(
	config?: SingleStoreIntConfig,
): SingleStoreIntBuilderInitial<''>;
export function int<TName extends string>(
	name: TName,
	config?: SingleStoreIntConfig,
): SingleStoreIntBuilderInitial<TName>;
export function int(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreIntBuilder(name, config);
}
