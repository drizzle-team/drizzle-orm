import type { HasGenerated } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder, type SingleStoreGeneratedColumnConfig } from './common.ts';

export class SingleStoreVectorBuilder extends SingleStoreColumnBuilder<{
	dataType: 'array vector';
	data: Array<number>;
	driverParam: string | Buffer;
	isLengthExact: true;
}, { length: number; isLengthExact: true; elementType?: Exclude<ElementType, 'I64'> }> {
	static override readonly [entityKind]: string = 'SingleStoreVectorBuilder';

	constructor(name: string, config: SingleStoreVectorConfig) {
		super(name, 'array vector', 'SingleStoreVector');
		this.config.length = config.dimensions;
		this.config.elementType = config.elementType as Exclude<ElementType, 'I64'> | undefined;
		this.config.isLengthExact = true;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreVector(
			table,
			this.config as any,
		);
	}

	override generatedAlwaysAs(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		as: SQL | (() => SQL) | this['_']['data'],
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		config?: Partial<SingleStoreGeneratedColumnConfig>,
	): HasGenerated<this, { type: 'always' }> {
		throw new Error('Method not implemented.');
	}
}

export class SingleStoreVector<T extends ColumnBaseConfig<'array vector'>>
	extends SingleStoreColumn<T, { length: number; elementType?: Exclude<ElementType, 'I64'> }>
{
	static override readonly [entityKind]: string = 'SingleStoreVector';

	readonly elementType: Exclude<ElementType, 'I64'> | undefined = this.config.elementType;

	/** @internal */
	override readonly codec = `vector_${(this.elementType ?? 'F32').toLowerCase()}` as
		| 'vector_i8'
		| 'vector_i16'
		| 'vector_i32'
		| 'vector_f32'
		| 'vector_f64';

	getSQLType(): string {
		return `vector(${this.config.length}, ${this.elementType || 'F32'})`;
	}

	override mapToDriverValue = (value: Array<number>): string => {
		return `[${value.map((e) => e.toString()).join(',')}]`;
	};
}

export class SingleStoreBigIntVectorBuilder extends SingleStoreColumnBuilder<{
	dataType: 'array int64vector';
	data: Array<bigint>;
	driverParam: string | Buffer;
	isLengthExact: true;
}, { length: number; isLengthExact: true }> {
	static override readonly [entityKind]: string = 'SingleStoreBigIntVectorBuilder';

	constructor(name: string, config: SingleStoreVectorConfig) {
		super(name, 'array int64vector', 'SingleStoreBigIntVector');
		this.config.length = config.dimensions;
		this.config.isLengthExact = true;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreBigIntVector(
			table,
			this.config as any,
		);
	}

	override generatedAlwaysAs(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		as: SQL | (() => SQL) | this['_']['data'],
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		config?: Partial<SingleStoreGeneratedColumnConfig>,
	): HasGenerated<this, { type: 'always' }> {
		throw new Error('Method not implemented.');
	}
}

export class SingleStoreBigIntVector<T extends ColumnBaseConfig<'array int64vector'>>
	extends SingleStoreColumn<T, { length: number }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigIntVector';

	/** @internal */
	override readonly codec = 'vector_i64';

	readonly elementType = 'I64';

	getSQLType(): string {
		return `vector(${this.config.length}, ${this.elementType})`;
	}

	override mapToDriverValue = (value: Array<bigint>): string => {
		return `[${value.map((e) => e.toString()).join(',')}]`;
	};
}

type ElementType = 'I8' | 'I16' | 'I32' | 'I64' | 'F32' | 'F64';

export interface SingleStoreVectorConfig<TType extends ElementType | undefined = ElementType | undefined> {
	dimensions: number;
	elementType?: TType;
}

export function vector<TType extends ElementType | undefined>(
	config: SingleStoreVectorConfig<TType>,
): Equal<TType, 'I64'> extends true ? SingleStoreBigIntVectorBuilder : SingleStoreVectorBuilder;
export function vector<TType extends ElementType | undefined>(
	name: string,
	config: SingleStoreVectorConfig<TType>,
): Equal<TType, 'I64'> extends true ? SingleStoreBigIntVectorBuilder : SingleStoreVectorBuilder;
export function vector(a: string | SingleStoreVectorConfig, b?: SingleStoreVectorConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreVectorConfig>(a, b);
	return config.elementType === 'I64'
		? new SingleStoreBigIntVectorBuilder(name, config)
		: new SingleStoreVectorBuilder(name, config);
}
