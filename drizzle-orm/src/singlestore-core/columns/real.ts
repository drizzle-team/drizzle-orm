import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreRealBuilder extends SingleStoreColumnBuilderWithAutoIncrement<
	{
		dataType: 'number double';
		data: number;
		driverParam: number | string;
	},
	SingleStoreRealConfig
> {
	static override readonly [entityKind]: string = 'SingleStoreRealBuilder';

	constructor(name: string, config: SingleStoreRealConfig | undefined) {
		super(name, 'number double', 'SingleStoreReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreReal(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreReal<T extends ColumnBaseConfig<'number double'>> extends SingleStoreColumnWithAutoIncrement<
	T,
	SingleStoreRealConfig
> {
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

export function real(
	config?: SingleStoreRealConfig,
): SingleStoreRealBuilder;
export function real(
	name: string,
	config?: SingleStoreRealConfig,
): SingleStoreRealBuilder;
export function real(a?: string | SingleStoreRealConfig, b: SingleStoreRealConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreRealConfig>(a, b);
	return new SingleStoreRealBuilder(name, config);
}
