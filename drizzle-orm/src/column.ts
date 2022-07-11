import { ColumnBuilder } from './column-builder';
import { Primitive } from './sql';
import { AnyTable } from './table';

export abstract class Column<
	TTableName extends string,
	TType extends Primitive = Primitive,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
	> {
	readonly name: string;
	readonly notNull: TNotNull;
	readonly default: InferDefaultColumnValue<TType, TNotNull>;
	private type!: TType;

	constructor(
		readonly table: AnyTable<TTableName>,
		builder: ColumnBuilder<Column<string, TType, TNotNull, TDefault>, TNotNull, TDefault>,
	) {
		this.name = builder.name;
		this.notNull = builder._notNull;
		this.default = builder._default;
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: any): TType {
		return value;
	}

	mapToDriverValue(value: TType): any {
		return value;
	}
}

export type AnyColumn = Column<string>;

export type InferColumnType<
	TColumn extends AnyColumn,
	TInferMode extends 'query' | 'raw',
	> = TColumn extends Column<any, infer TType, infer TNotNull, infer TDefault>
	? TInferMode extends 'raw' // Raw mode
	? TType // Just return the underlying type
	: TNotNull extends true // Query mode
	? TType // Query mode, not null
	: TType | null // Query mode, nullable
	: never;

export type InferDefaultColumnValue<TType, TNotNull extends boolean> = TNotNull extends true
	? TType
	: TType | null;

export type InferColumnTable<T extends AnyColumn> = T extends Column<infer TTable> ? TTable : never;
