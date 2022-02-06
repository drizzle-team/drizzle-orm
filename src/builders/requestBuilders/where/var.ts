/* eslint-disable max-len */
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ecranate } from '../../../utils/ecranate';
import Expr from './where';

export default class Var<T extends AbstractColumn<ColumnType<any>, boolean, boolean>> extends Expr {
  private column: T;

  public constructor(column: T) {
    super();
    this.column = column;
  }

  public toQuery = (postition?: number, tableCache?: {[tableName: string]: string}): { query: string, values: Array<any> } => {
    const tableName = tableCache && tableCache[this.column.getParentName()] ? tableCache[this.column.getParentName()] : this.column.getParentName();
    return { query: `${tableName}.${ecranate(this.column.getColumnName())}`, values: [] };
  };
}
