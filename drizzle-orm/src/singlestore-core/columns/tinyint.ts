import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, GeneratedColumnConfig, HasGenerated, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export type SingleStoreTinyIntBuilderInitial<TName extends string> = SingleStoreTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreTinyInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreTinyInt'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreIntConfig>
{
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(as: SQL<unknown> | (() => SQL) | T['data'], config?: Partial<GeneratedColumnConfig<unknown>>): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreTinyIntBuilder';

	constructor(name: T['name'], config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreTinyInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreTinyInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreTinyInt<T extends ColumnBaseConfig<'number', 'SingleStoreTinyInt'>>
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
