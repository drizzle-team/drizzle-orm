import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreDoubleBuilderInitial<TName extends string> = SingleStoreDoubleBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreDouble';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreDouble'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDoubleConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDoubleBuilder';

	constructor(name: T['name'], config: SingleStoreDoubleConfig | undefined) {
		super(name, 'number', 'SingleStoreDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDouble<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDouble<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDouble<T extends ColumnBaseConfig<'number', 'SingleStoreDouble'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDoubleConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDouble';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `double(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'double';
		} else {
			type += `double(${this.precision})`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface SingleStoreDoubleConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function double(): SingleStoreDoubleBuilderInitial<''>;
export function double(
	config?: SingleStoreDoubleConfig,
): SingleStoreDoubleBuilderInitial<''>;
export function double<TName extends string>(
	name: TName,
	config?: SingleStoreDoubleConfig,
): SingleStoreDoubleBuilderInitial<TName>;
export function double(a?: string | SingleStoreDoubleConfig, b?: SingleStoreDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDoubleConfig>(a, b);
	return new SingleStoreDoubleBuilder(name, config);
}
