import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, GeneratedColumnConfig, HasGenerated, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';
import type { SQL } from '~/sql/index.ts';

export type SingleStoreBinaryBuilderInitial<TName extends string> = SingleStoreBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreBinary'>>
	extends SingleStoreColumnBuilder<
		T,
		SingleStoreBinaryConfig
	>
{
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(as: SQL<unknown> | (() => SQL) | T['data'], config?: Partial<GeneratedColumnConfig<unknown>>): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'string', 'SingleStoreBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBinary<T extends ColumnBaseConfig<'string', 'SingleStoreBinary'>> extends SingleStoreColumn<
	T,
	SingleStoreBinaryConfig
> {
	static override readonly [entityKind]: string = 'SingleStoreBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface SingleStoreBinaryConfig {
	length?: number;
}

export function binary(): SingleStoreBinaryBuilderInitial<''>;
export function binary(
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilderInitial<''>;
export function binary<TName extends string>(
	name: TName,
	config?: SingleStoreBinaryConfig,
): SingleStoreBinaryBuilderInitial<TName>;
export function binary(a?: string | SingleStoreBinaryConfig, b: SingleStoreBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBinaryConfig>(a, b);
	return new SingleStoreBinaryBuilder(name, config.length);
}
