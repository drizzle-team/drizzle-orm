import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreFloatBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number ufloat' : 'number float';
		data: number;
		driverParam: number | string;
	}, SingleStoreFloatConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreFloatBuilder';

	constructor(name: string, config: SingleStoreFloatConfig | undefined) {
		super(name, config?.unsigned ? 'number ufloat' : 'number float' as any, 'SingleStoreFloat');
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

export class SingleStoreFloat<T extends ColumnBaseConfig<'number float' | 'number ufloat'>>
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

	override mapFromDriverValue(value: unknown): number {
		if (typeof value !== 'number') return Number(value);

		return value;
	}
}

export interface SingleStoreFloatConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	precision?: number;
	scale?: number;
	unsigned?: TUnsigned;
}

export function float<TUnsigned extends boolean | undefined>(
	config?: SingleStoreFloatConfig<TUnsigned>,
): SingleStoreFloatBuilder<TUnsigned>;
export function float<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreFloatConfig<TUnsigned>,
): SingleStoreFloatBuilder<TUnsigned>;
export function float(a?: string | SingleStoreFloatConfig, b?: SingleStoreFloatConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreFloatConfig>(a, b);
	return new SingleStoreFloatBuilder(name, config);
}
