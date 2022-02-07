import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ExtractModel } from '../../tables/inferTypes';

export default class Join<TTable> {
  public fromColumn: AbstractColumn<ColumnType, boolean, boolean>;
  public toColumn: AbstractColumn<ColumnType, boolean, boolean>;
  public joinTableName: string;
  public mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; };
  public type: JoinStrategy;

  public constructor(joinTableName: string,
    fromColumn: AbstractColumn<ColumnType, boolean, boolean>,
    toColumn: AbstractColumn<ColumnType, boolean, boolean>,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; }) {
    this.joinTableName = joinTableName;
    this.toColumn = toColumn;
    this.fromColumn = fromColumn;
    this.mappedServiceToDb = mappedServiceToDb;
  }

  public joinStrategy = (type: JoinStrategy): Join<TTable> => {
    this.type = type;
    return this;
  };

  public columns = (fromColumn: AbstractColumn<ColumnType>,
    toColumn: AbstractColumn<ColumnType>): Join<TTable> => {
    this.toColumn = toColumn;
    this.fromColumn = fromColumn;
    return this;
  };
}

export enum JoinStrategy {
  INNER_JOIN = 'INNER JOIN',
  LEFT_JOIN = 'LEFT JOIN',
  RIGHT_JOIN = 'RIGHT JOIN',
  FULL_JOIN = 'FULL JOIN',
}
