import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { UpdateCustomExpr } from './updates';

export default class Increment<T extends AbstractColumn<ColumnType<any>, boolean, boolean>>
  extends UpdateCustomExpr<T> {
  private _column: T;
  private _value: number;

  public constructor(value: number) {
    super();
    this._value = value;
  }

  public setColumn = (column: T): UpdateCustomExpr<T> => {
    this._column = column;
    return this;
  };

  public toQuery = (): { query: string, values: Array<any>} => {
    const query = `${this._column.getColumnName()} = ${this._column.getColumnName()} + ${this._value}`;
    return { query, values: [] };
  };
}
