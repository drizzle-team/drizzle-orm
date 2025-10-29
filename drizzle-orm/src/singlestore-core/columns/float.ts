import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreFloatBuilderInitial<TName extends string> = SingleStoreFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreFloat';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreFloat'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreFloatConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreFloatBuilder';

	constructor(name: T['name'], config: SingleStoreFloatConfig | undefined) {
		super(name, 'number', 'SingleStoreFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreFloat<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreFloat<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreFloat<T extends ColumnBaseConfig<'number', 'SingleStoreFloat'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreFloatConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreFloat';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `float(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'float';
		} else {
			type += `float(${this.precision},0)`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface SingleStoreFloatConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function float(): SingleStoreFloatBuilderInitial<''>;
export function float(
	config?: SingleStoreFloatConfig,
): SingleStoreFloatBuilderInitial<''>;
export function float<TName extends string>(
	name: TName,
	config?: SingleStoreFloatConfig,
): SingleStoreFloatBuilderInitial<TName>;
export function float(a?: string | SingleStoreFloatConfig, b?: SingleStoreFloatConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreFloatConfig>(a, b);
	return new SingleStoreFloatBuilder(name, config);
}
