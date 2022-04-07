import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { UpdateExpr } from './updates';
import { ISession } from '../../../db/session';

export default class SetObject<T extends AbstractColumn<ColumnType<any>, boolean, boolean>>
  extends UpdateExpr {
  private _column: T;
  private _value: any;

  public constructor(column: T, value: any) {
    super();
    this._column = column;
    this._value = value;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any>} => {
    const nextPosition = position || 1;

    const valueToInsert = this._value === null || this._value === undefined
      ? this._value
      : this._column.getColumnType().insertStrategy(this._value);

    const query = `"${this._column.getColumnName()}"=${session.parametrized(nextPosition)}`;

    return { query, values: [valueToInsert] };
  };
}
