import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreDoubleBuilder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number udouble' : 'number double';
		data: number;
		driverParam: number | string;
	}, SingleStoreDoubleConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDoubleBuilder';

	constructor(name: string, config: SingleStoreDoubleConfig | undefined) {
		super(name, config?.unsigned ? 'number udouble' : 'number double' as any, 'SingleStoreDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDouble(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDouble<T extends ColumnBaseConfig<'number double' | 'number udouble'>>
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

export interface SingleStoreDoubleConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	precision?: number;
	scale?: number;
	unsigned?: TUnsigned;
}

export function double<TUnsigned extends boolean | undefined>(
	config?: SingleStoreDoubleConfig<TUnsigned>,
): SingleStoreDoubleBuilder<TUnsigned>;
export function double<TUnsigned extends boolean | undefined>(
	name: string,
	config?: SingleStoreDoubleConfig<TUnsigned>,
): SingleStoreDoubleBuilder<TUnsigned>;
export function double(a?: string | SingleStoreDoubleConfig, b?: SingleStoreDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDoubleConfig>(a, b);
	return new SingleStoreDoubleBuilder(name, config);
}
