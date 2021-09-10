import { AbstractColumn, Column } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ecranate } from '../../utils/ecranate';

export default class Aggregator {
  protected _fields: Array<string> = [];
  protected _tableName: string;
  protected _columnsTypes: AbstractColumn<ColumnType>[];

  public constructor(tableName: string) {
    this._tableName = tableName;
  }

  public appendFields = (columns: AbstractColumn<ColumnType>[]) => {
    this._fields = this.generateSelectArray(this._tableName, columns);
    this._columnsTypes = columns;
  };

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
