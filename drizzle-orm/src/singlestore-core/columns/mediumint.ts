import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';
import type { SingleStoreIntConfig } from './int.ts';

export type SingleStoreMediumIntBuilderInitial<TName extends string> = SingleStoreMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreMediumInt'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreIntConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreMediumIntBuilder';

	constructor(name: T['name'], config?: SingleStoreIntConfig) {
		super(name, 'number', 'SingleStoreMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreMediumInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreMediumInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreMediumInt<T extends ColumnBaseConfig<'number', 'SingleStoreMediumInt'>>
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

export function mediumint(): SingleStoreMediumIntBuilderInitial<''>;
export function mediumint(
	config?: SingleStoreIntConfig,
): SingleStoreMediumIntBuilderInitial<''>;
export function mediumint<TName extends string>(
	name: TName,
	config?: SingleStoreIntConfig,
): SingleStoreMediumIntBuilderInitial<TName>;
export function mediumint(a?: string | SingleStoreIntConfig, b?: SingleStoreIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreIntConfig>(a, b);
	return new SingleStoreMediumIntBuilder(name, config);
}
