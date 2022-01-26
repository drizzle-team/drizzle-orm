import { QueryResult } from 'pg';
import { AbstractColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import { ExtractModel } from '../tables/inferTypes';

// eslint-disable-next-line max-len
const checkProperties = (obj: any) => Object.values(obj).every((x) => x === null || Number.isNaN(x));

export default class QueryResponseMapper {
  public static map = <ITable>(mappedServiceToDb: { [name in keyof ExtractModel<ITable>]
    : AbstractColumn<ColumnType>; },
    queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<ITable> | undefined> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<ITable> = {} as ExtractModel<ITable>;

      Object.keys(mappedServiceToDb).forEach((key) => {
        const column = mappedServiceToDb[key as keyof ExtractModel<ITable>];
        const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<ITable>] = value;
      });
      if (checkProperties(mappedRow)) {
        response.push(undefined);
      }
      response.push(mappedRow);
    });
    return response;
  };

  public static partialMap = <T>(partial: { [name: string]
  : AbstractColumn<ColumnType>; }, queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<T> | undefined> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<T> = {} as ExtractModel<T>;

      Object.keys(partial).forEach((key) => {
        const column = partial[key];
        const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<T>] = value;
      });
      if (checkProperties(mappedRow)) {
        response.push(undefined);
      }
      response.push(mappedRow);
    });
    return response;
  };
}
