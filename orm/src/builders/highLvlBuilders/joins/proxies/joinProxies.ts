/* eslint-disable import/no-cycle */
/* eslint-disable max-classes-per-file */

import { ExtractModel } from '../../../../tables/inferTypes';
import AbstractTable from '../../../../tables/abstractTable';
import ColumnType from '../../../../columns/types/columnType';
import { AbstractColumn } from '../../../../columns/column';

export class JoinedColumn<TJoinedTableColumn extends AbstractColumn<ColumnType>>
implements ProxyHandler<TJoinedTableColumn> {
  private parentName: string = 'getParentName';

  public constructor(private tableObj: any, private aliasCounter: number) {

  }

  public get(columnObj: TJoinedTableColumn, prop: string) {
    if (prop === this.parentName) {
      return () => `${this.tableObj.tableName()}_${this.aliasCounter}`;
    }

    return columnObj[prop as keyof typeof columnObj];
  }
}

export class JoinedHandler<TJoinedTable extends AbstractTable<TJoinedTable>>
implements ProxyHandler<TJoinedTable> {
  private tableName: string = 'tableName';

  public constructor(private aliasCounter: number) {

  }

  public get(tableObj: TJoinedTable, prop: string | symbol, receiver: any): any {
    if (prop === this.tableName) {
      return () => `${tableObj.tableName()}_${this.aliasCounter}`;
    }
    const columnProp = tableObj[prop as keyof typeof tableObj];
    if (columnProp instanceof AbstractColumn) {
      return new Proxy(columnProp, new JoinedColumn(tableObj, this.aliasCounter));
    }
    if (prop === 'mapServiceToDb') {
      return () => Object.getOwnPropertyNames(tableObj)
        .reduce<{[name in keyof ExtractModel<TJoinedTable>]
        : AbstractColumn<ColumnType>}>((res, fieldName) => {
        const field1: object = tableObj[fieldName as keyof TJoinedTable] as unknown as object;
        if (field1 instanceof AbstractColumn) {
          const field = new Proxy(field1, new JoinedColumn(tableObj, this.aliasCounter));
          res[fieldName as keyof ExtractModel<TJoinedTable>] = field;
        }
        return res;
      }, {} as {[name in keyof ExtractModel<TJoinedTable>]: AbstractColumn<ColumnType>});
    }
    return tableObj[prop as keyof TJoinedTable];
  }
}
