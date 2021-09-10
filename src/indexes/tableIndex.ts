import { Column } from '../columns/column';
import ColumnType from '../columns/types/columnType';

export default class TableIndex {
  private _columns: Column<ColumnType<any>, boolean, boolean>[] = [];
  private _tableName: string;

  public constructor(tableName:string, columns: Column<ColumnType<any>, boolean, boolean>[]) {
    this._columns = columns;
    this._tableName = tableName;
  }

  public getColumns = (): Column<ColumnType<any>, boolean, boolean>[] => this._columns;

  public indexName = (): string => {
    const columnNames = this._columns.map((column) => column.getColumnName());
    return `${this._tableName}_${columnNames.join('_')}_index`;
  };
}
