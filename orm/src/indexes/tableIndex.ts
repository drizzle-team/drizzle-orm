import { Column } from '../columns/column';
import ColumnType from '../columns/types/columnType';

export default class TableIndex {
  private _columns: Column<ColumnType<any>, boolean, boolean>[] = [];
  private _tableName: string;
  private _isUnique: boolean;

  public constructor(tableName: string,
    columns: Column<ColumnType<any>, boolean, boolean>[],
    isUnique: boolean = false) {
    this._columns = columns;
    this._tableName = tableName;
    this._isUnique = isUnique;
  }

  public getColumns = (): Column<ColumnType<any>, boolean, boolean>[] => this._columns;

  public indexName = (): string => {
    const columnNames = this._columns.map((column) => column.getColumnName());
    return `${this._tableName}_${columnNames.join('_')}_index`;
  };

  public isUnique = (): boolean => this._isUnique;
}
