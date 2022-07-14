import { AnyTable, AnyColumn, Column, InferColumnType, InferDefaultColumnValue } from '.';

export abstract class ColumnBuilder<
	TColumnType extends AnyColumn = AnyColumn,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> {
	private columnType!: TColumnType;
	/** @internal */ _notNull = false as TNotNull;
	/** @internal */ _default!: InferDefaultColumnValue<
		InferColumnType<TColumnType, 'raw'>,
		TNotNull
	>;
	/** @internal */ _primaryKey = false;
	/* @internal */ _references: (() => Column<string, InferColumnType<TColumnType, 'raw'>>)[] = [];
	/** @internal */ name: string;

	constructor(name: string) {
		this.name = name;
	}

	notNull(): ColumnBuilder<TColumnType, true, TDefault> {
		this._notNull = true as TNotNull;
		return this as ColumnBuilder<TColumnType, true, TDefault>;
	}

	default(
		value: InferDefaultColumnValue<InferColumnType<TColumnType, 'raw'>, TNotNull>,
	): ColumnBuilder<TColumnType, TNotNull, true> {
		this._default = value;
		return this as ColumnBuilder<TColumnType, TNotNull, true>;
	}

	primaryKey(): ColumnBuilder<TColumnType, true, TDefault> {
		this._primaryKey = true;
		return this as ColumnBuilder<TColumnType, true, TDefault>;
	}

	references(ref: () => Column<any, InferColumnType<TColumnType, 'raw'>>): this {
		this._references.push(ref);
		return this;
	}

	/** @internal */
	abstract build<TTableName extends string>(table: AnyTable<TTableName>): TColumnType;
}

export type InferColumnBuilderType<TConfig extends ColumnBuilder> = TConfig extends ColumnBuilder<
	infer TColumnType
>
	? TColumnType
	: never;

export type InferColumnBuilderNotNull<TConfig extends ColumnBuilder> =
	TConfig extends ColumnBuilder<any, infer TNotNull> ? TNotNull : never;

export type InferColumnBuilderDefault<TConfig extends ColumnBuilder> =
	TConfig extends ColumnBuilder<any, any, infer TDefault> ? TDefault : never;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilder>,
> = {
	[Key in keyof TConfigMap]: Column<
		TTableName,
		InferColumnType<InferColumnBuilderType<TConfigMap[Key]>, 'raw'>,
		InferColumnBuilderNotNull<TConfigMap[Key]>,
		InferColumnBuilderDefault<TConfigMap[Key]>
	>;
};
