import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	GeneratedColumnConfig,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVarBinaryBuilderInitial<TName extends string> = SingleStoreVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreVarBinary'>>
	extends SingleStoreColumnBuilder<T, SingleStoreVarbinaryOptions>
{
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(
		as: SQL<unknown> | (() => SQL) | T['data'],
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarbinaryOptions) {
		super(name, 'string', 'SingleStoreVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreVarBinary<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreVarBinary<
	T extends ColumnBaseConfig<'string', 'SingleStoreVarBinary'>,
> extends SingleStoreColumn<T, SingleStoreVarbinaryOptions> {
	static override readonly [entityKind]: string = 'SingleStoreVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface SingleStoreVarbinaryOptions {
	length: number;
}

export function varbinary(
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilderInitial<''>;
export function varbinary<TName extends string>(
	name: TName,
	config: SingleStoreVarbinaryOptions,
): SingleStoreVarBinaryBuilderInitial<TName>;
export function varbinary(a?: string | SingleStoreVarbinaryOptions, b?: SingleStoreVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarbinaryOptions>(a, b);
	return new SingleStoreVarBinaryBuilder(name, config);
}
