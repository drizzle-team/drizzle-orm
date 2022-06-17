/* eslint-disable max-len */
import { AbstractColumn, Column } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { AbstractTable } from '../../tables';
import { ecranate } from '../../utils/ecranate';

// eslint-disable-next-line max-len
export default class Aggregator {
  protected _fields: Array<string> = [];
  protected _table: AbstractTable<any>;

  public constructor(table: AbstractTable<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, AbstractTable<any>>}) {
    this._table = table;
    if (!partial) {
      this._fields = this.generateSelectArray(this._table.tableName(),
        Object.values(this._table.mapServiceToDb()));
    } else {
      this._fields = this.generateSelectArray(this._table.tableName(),
        Object.values(partial));
    }
  }

  protected generateSelectArray = (table: string, columns: AbstractColumn<ColumnType>[], id?: number) => {
    const selectFields: string[] = [];

    columns.forEach((field: any) => {
      if (field instanceof Column) {
        selectFields.push(' ');
        selectFields.push(table);
        selectFields.push('.');
        selectFields.push(ecranate(field.getColumnName()));
        selectFields.push(' AS ');
        selectFields.push(ecranate(`${table}_${field.getColumnName()}`));
        selectFields.push(',');
      }
    });

    selectFields.pop();
    return selectFields;
  };
}
