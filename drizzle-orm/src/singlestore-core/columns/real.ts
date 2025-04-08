import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreRealBuilderInitial<TName extends string> = SingleStoreRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreReal';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreReal'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<
		T,
		SingleStoreRealConfig
	>
{
	static override readonly [entityKind]: string = 'SingleStoreRealBuilder';

	constructor(name: T['name'], config: SingleStoreRealConfig | undefined) {
		super(name, 'number', 'SingleStoreReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreReal<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreReal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreReal<T extends ColumnBaseConfig<'number', 'SingleStoreReal'>>
	extends SingleStoreColumnWithAutoIncrement<
		T,
		SingleStoreRealConfig
	>
{
	static override readonly [entityKind]: string = 'SingleStoreReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface SingleStoreRealConfig {
	precision?: number;
	scale?: number;
}

export function real(): SingleStoreRealBuilderInitial<''>;
export function real(
	config?: SingleStoreRealConfig,
): SingleStoreRealBuilderInitial<''>;
export function real<TName extends string>(
	name: TName,
	config?: SingleStoreRealConfig,
): SingleStoreRealBuilderInitial<TName>;
export function real(a?: string | SingleStoreRealConfig, b: SingleStoreRealConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreRealConfig>(a, b);
	return new SingleStoreRealBuilder(name, config);
}
