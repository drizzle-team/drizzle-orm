import { QueryResult } from 'pg';
import { AbstractColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import { ExtractModel } from '../tables/inferTypes';

// eslint-disable-next-line max-len
const checkProperties = (obj: any) => Object.values(obj).every((x) => x === null || Number.isNaN(x));

export default class QueryResponseMapper {
  public static map = <ITable>(mappedServiceToDb: { [name in keyof ExtractModel<ITable>]
    : AbstractColumn<ColumnType>; },
    queryResult: QueryResult<any>) => {
    const response: Array<ExtractModel<ITable> | undefined> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<ITable> = {} as ExtractModel<ITable>;

      Object.keys(mappedServiceToDb).forEach((key) => {
        const column = mappedServiceToDb[key as keyof ExtractModel<ITable>];
        const value = column.getColumnType().selectStrategy(row[column.getAlias()]) as any;
        mappedRow[key as keyof ExtractModel<ITable>] = value;
      });
      if (checkProperties(mappedRow)) {
        response.push(undefined);
      }
      response.push(mappedRow);
    });
    return response;
  };
}
