import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreFloatBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number float';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, SingleStoreFloatConfig> {
	static override readonly [entityKind]: string = 'SingleStoreFloatBuilder';

	constructor(name: string, config: SingleStoreFloatConfig | undefined) {
		super(name, 'number float', 'SingleStoreFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreFloat(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreFloat<T extends ColumnBaseConfig<'number float'>>
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

export function float(
	config?: SingleStoreFloatConfig,
): SingleStoreFloatBuilder;
export function float(
	name: string,
	config?: SingleStoreFloatConfig,
): SingleStoreFloatBuilder;
export function float(a?: string | SingleStoreFloatConfig, b?: SingleStoreFloatConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreFloatConfig>(a, b);
	return new SingleStoreFloatBuilder(name, config);
}
