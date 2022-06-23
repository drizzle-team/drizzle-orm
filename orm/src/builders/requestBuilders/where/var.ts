/* eslint-disable max-len */
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ecranate } from '../../../utils/ecranate';
import Expr from './where';
import { ISession } from '../../../db/session';

export default class Var<T extends AbstractColumn<ColumnType<any>, boolean, boolean>> extends Expr {
  private column: T;

  public constructor(column: T) {
    super();
    this.column = column;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any> } => {
    const tableName = this.column.getParentName();

    return { query: `${tableName}.${ecranate(this.column.getColumnName())}`, values: [] };
  };

  public toQueryV1 = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => {
    const tableName = tableCache && tableCache[this.column.getParentName()] ? tableCache[this.column.getParentName()] : this.column.getParentName();
    return { query: `${tableName}.${ecranate(this.column.getColumnName())}`, values: [] };
  };
}
