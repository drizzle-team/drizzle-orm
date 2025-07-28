import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import type { SingleStoreGeneratedColumnConfig } from './common.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreVectorBuilder extends SingleStoreColumnBuilder<{
	name: string;
	dataType: 'array';
	data: Array<number>;
	driverParam: string;
	enumValues: undefined;
}, SingleStoreVectorConfig> {
	static override readonly [entityKind]: string = 'SingleStoreVectorBuilder';

	constructor(name: string, config: SingleStoreVectorConfig) {
		super(name, 'array', 'SingleStoreVector');
		this.config.dimensions = config.dimensions;
		this.config.elementType = config.elementType;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreVector(
			table,
			this.config as any,
		);
	}

	/** @internal */
	override generatedAlwaysAs(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		as: SQL<unknown> | (() => SQL) | Array<number>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		config?: SingleStoreGeneratedColumnConfig,
	) {
		throw new Error('not implemented');
	}
}

export class SingleStoreVector<T extends ColumnBaseConfig<'array'>>
	extends SingleStoreColumn<T, SingleStoreVectorConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreVector';

	dimensions: number = this.config.dimensions;
	elementType: ElementType | undefined = this.config.elementType;

	getSQLType(): string {
		return `vector(${this.dimensions}, ${this.elementType || 'F32'})`;
	}

	override mapToDriverValue(value: Array<number>) {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: string): Array<number> {
		return JSON.parse(value);
	}
}

type ElementType = 'I8' | 'I16' | 'I32' | 'I64' | 'F32' | 'F64';

export interface SingleStoreVectorConfig {
	dimensions: number;
	elementType?: ElementType;
}

export function vector(
	config: SingleStoreVectorConfig,
): SingleStoreVectorBuilder;
export function vector(
	name: string,
	config: SingleStoreVectorConfig,
): SingleStoreVectorBuilder;
export function vector(a: string | SingleStoreVectorConfig, b?: SingleStoreVectorConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVectorConfig>(a, b);
	return new SingleStoreVectorBuilder(name, config);
}
