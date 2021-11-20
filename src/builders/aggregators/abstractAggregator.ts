import { AbstractColumn, Column } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { AbstractTable } from '../../tables';
import { ecranate } from '../../utils/ecranate';

export default class Aggregator {
  protected _fields: Array<string> = [];
  protected _table: AbstractTable<any>;

  public constructor(table: AbstractTable<any>) {
    this._table = table;
    this._fields = this.generateSelectArray(this._table.tableName(),
      Object.values(this._table.mapServiceToDb()));
  }

  protected generateSelectArray = (table: string, columns: AbstractColumn<ColumnType>[]) => {
    const selectFields: string[] = [];

    columns.forEach((field: any) => {
      if (field instanceof Column) {
        selectFields.push(' ');
        selectFields.push(table);
        selectFields.push('.');
        selectFields.push(ecranate(field.getColumnName()));
        selectFields.push(' AS ');
        selectFields.push(ecranate(`${table.replace('.', '_')}_${field.getColumnName()}`));
        selectFields.push(',');
      }
    });

    selectFields.pop();
    return selectFields;
  };
}
