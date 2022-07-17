import { Simplify } from 'type-fest';

import {
	AnyColumn,
	Column,
	InferColumnDriverType,
	InferColumnType,
	InferDefaultColumnValue,
} from './column';
import { AnyTable } from './table';

export abstract class ColumnBuilder<
	TColumnType extends AnyColumn,
	TDriverType,
	TNotNull extends boolean,
	TDefault extends boolean,
> {
	protected typeKeeper!: {
		brand: 'ColumnBuilder';
		columnType: TColumnType;
		notNull: TNotNull;
		default: TDefault;
	};

	/** @internal */ _notNull = false as TNotNull;
	/** @internal */ _default!: InferDefaultColumnValue<
		InferColumnType<TColumnType, 'raw'>,
		TNotNull
	>;
	/** @internal */ _primaryKey = false;
	/* @internal */ _references: (() => Column<
		string,
		InferColumnType<TColumnType, 'raw'>,
		any,
		any,
		any
	>)[] = [];
	/** @internal */ name: string;

	constructor(name: string) {
		this.name = name;
	}

	notNull(): ColumnBuilder<TColumnType, TDriverType, true, TDefault> {
		this._notNull = true as TNotNull;
		return this as ColumnBuilder<TColumnType, TDriverType, true, TDefault>;
	}

	default(
		value: InferDefaultColumnValue<InferColumnType<TColumnType, 'raw'>, TNotNull>,
	): ColumnBuilder<TColumnType, TDriverType, TNotNull, true> {
		this._default = value;
		return this as ColumnBuilder<TColumnType, TDriverType, TNotNull, true>;
	}

	primaryKey(): ColumnBuilder<TColumnType, TDriverType, true, TDefault> {
		this._primaryKey = true;
		return this as ColumnBuilder<TColumnType, TDriverType, true, TDefault>;
	}

	references(ref: () => Column<any, InferColumnType<TColumnType, 'raw'>, any, any, any>): this {
		this._references.push(ref);
		return this;
	}

	/** @internal */
	abstract build<TTableName extends string>(table: AnyTable<TTableName>): TColumnType;
}

export type AnyColumnBuilder = ColumnBuilder<any, any, any, any>;

export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, AnyColumnBuilder>,
> = Simplify<{
	[Key in keyof TConfigMap]: TConfigMap[Key] extends ColumnBuilder<
		infer TType,
		infer TDriverType,
		infer TNotNull,
		infer TDefault
	>
		? Column<TTableName, InferColumnType<TType, 'raw'>, TDriverType, TNotNull, TDefault>
		: never;
}>;
