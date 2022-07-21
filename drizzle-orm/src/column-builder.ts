import {
	ColumnData,
	ColumnDriverParam,
	ColumnHasDefault,
	ColumnNotNull,
	TableName,
	Unwrap,
} from './branded-types';
import { Column } from './column';
import { AnySQL } from './sql';
import { AnyTable } from './table';

export abstract class ColumnBuilder<
	TData extends ColumnData,
	TDriverParam extends ColumnDriverParam,
	TNotNull extends ColumnNotNull<boolean>,
	THasDefault extends ColumnHasDefault<boolean>,
> {
	protected typeKeeper!: {
		brand: 'ColumnBuilder';
		dataType: TData;
		notNull: TNotNull;
		default: THasDefault;
	};

	/** @internal */ _notNull = false as TNotNull;
	/** @internal */ _default: TData | undefined;

	/** @internal */ _primaryKey = false;
	/* @internal */ _references: (() => Column<
		TableName,
		TData,
		ColumnDriverParam,
		ColumnNotNull,
		ColumnHasDefault
	>)[] = [];
	/** @internal */ name: string;

	constructor(name: string) {
		this.name = name;
	}

	notNull(): ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		this._notNull = true as TNotNull;
		return this as ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault>;
	}

	default(
		value: Unwrap<TData> | AnySQL,
	): ColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		//TODO default escaping
		this._default = value as TData;
		return this as ColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>>;
	}

	primaryKey(): ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		this._primaryKey = true;
		return this as ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault>;
	}

	references(ref: () => Column<any, TData, any, any, any>): this {
		this._references.push(ref);
		return this;
	}

	/** @internal */
	abstract build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): Column<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}
