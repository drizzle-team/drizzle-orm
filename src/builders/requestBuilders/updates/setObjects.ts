import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { UpdateExpr } from './updates';

export default class SetObject<T extends AbstractColumn<ColumnType<any>, boolean, boolean>>
  extends UpdateExpr {
  private _column: T;
  private _value: any;

  public constructor(column: T, value: any) {
    super();
    this._column = column;
    this._value = value;
  }

  public toQuery = (position?: number): { query: string, values: Array<any>} => {
    const nextPosition = position || 1;

    const query = `"${this._column.getColumnName()}"=${this._value === null || this._value === undefined ? 'null' : `$${nextPosition}`}`;

    return { query, values: [this._column.getColumnType().insertStrategy(this._value)] };
  };
}
