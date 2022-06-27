/* eslint-disable max-classes-per-file */
/* eslint-disable import/no-cycle */
/* eslint-disable max-len */
import { QueryResult } from 'pg';
import { AbstractTable } from '..';
import { AbstractColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import { ExtractModel, PartialFor } from '../tables/inferTypes';

// eslint-disable-next-line max-len
// const checkProperties = (obj: any) => Object.values(obj).every((x) => x === null || Number.isNaN(x));

export default class QueryResponseMapper {
  public static map = <ITable>(mappedServiceToDb: { [name in keyof ExtractModel<ITable>]
    : AbstractColumn<ColumnType>; },
    queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<ITable>> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<ITable> = {} as ExtractModel<ITable>;

      Object.keys(mappedServiceToDb).forEach((key) => {
        const column = mappedServiceToDb[key as keyof ExtractModel<ITable>];
        const alias = `${column.getParentName()}_${column.getColumnName()}`;
        // const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<ITable>] = value === null ? undefined : value;
      });
      response.push(mappedRow);
    });
    return response;
  };

  public static partialMap = <T extends AbstractTable<T>>(partial: PartialFor<T>, queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<T>> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<T> = {} as ExtractModel<T>;

      Object.keys(partial).forEach((key) => {
        const column = partial[key];
        const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<T>] = value === null ? undefined : value;
      });
      response.push(mappedRow);
    });
    return response;
  };
}

export class QueryResponseMapperV1 {
  public static map = <ITable>(mappedServiceToDb: { [name in keyof ExtractModel<ITable>]
    : AbstractColumn<ColumnType>; },
    queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<ITable>> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<ITable> = {} as ExtractModel<ITable>;

      Object.keys(mappedServiceToDb).forEach((key) => {
        const column = mappedServiceToDb[key as keyof ExtractModel<ITable>];
        const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<ITable>] = value === null ? undefined : value;
      });
      response.push(mappedRow);
    });
    return response;
  };

  public static partialMap = <T>(partial: {
    [name: string]
    : AbstractColumn<ColumnType>;
  }, queryResult: QueryResult<any>, joinId?: number) => {
    const response: Array<ExtractModel<T>> = [];

    queryResult.rows.forEach((row) => {
      const mappedRow: ExtractModel<T> = {} as ExtractModel<T>;

      Object.keys(partial).forEach((key) => {
        const column = partial[key];
        const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
        const value = column.getColumnType().selectStrategy(row[alias]) as any;
        mappedRow[key as keyof ExtractModel<T>] = value === null ? undefined : value;
      });
      response.push(mappedRow);
    });
    return response;
  };
}
