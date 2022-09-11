import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName, Unwrap } from './branded-types';
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
		data: TData;
		driverParam: TDriverParam;
		notNull: TNotNull;
		default: THasDefault;
	};

	/** @internal */ _notNull = false as TNotNull;
	/** @internal */ _default: TData | undefined;
	/** @internal */ _primaryKey = false;
	/** @internal */ name: string;

	constructor(name: string) {
		this.name = name;
	}

	notNull(): ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		this._notNull = true as TNotNull;
		return this as ReturnType<this['notNull']>;
	}

	default(
		value: Unwrap<TData> | AnySQL,
	): ColumnBuilder<TData, TDriverParam, TNotNull, ColumnHasDefault<true>> {
		this._default = value as TData;
		return this as ReturnType<this['default']>;
	}

	primaryKey(): ColumnBuilder<TData, TDriverParam, ColumnNotNull<true>, THasDefault> {
		this._primaryKey = true;
		return this as ReturnType<this['primaryKey']>;
	}

	/** @internal */
	abstract build<TTableName extends TableName>(
		table: AnyTable<TTableName>,
	): Column<TTableName, TData, TDriverParam, TNotNull, THasDefault>;
}
