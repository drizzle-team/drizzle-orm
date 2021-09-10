import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import Session from '../../../db/session';
import { AbstractTable } from '../../../tables';
import { ExtractModel } from '../../../tables/inferTypes';
import Expr from '../../requestBuilders/where/where';

export default abstract class AbstractJoined<TTable extends AbstractTable<TTable>> {
  protected _tableName: string;
  protected _session: Session;
  protected _filter: Expr;
  protected _table: TTable;
  protected _columns: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; };

  public constructor(filter: Expr,
    tableName: string,
    session: Session,
    columns: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    table: TTable) {
    this._tableName = tableName;
    this._session = session;
    this._filter = filter;
    this._columns = columns;
    this._table = table;
  }
}
