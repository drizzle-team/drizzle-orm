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

  public toQuery = (): { query: string, values: Array<any> } => ({ query: `${this.column.getParentName()}.${ecranate(this.column.getColumnName())}`, values: [] });
}
