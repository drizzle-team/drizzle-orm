import ColumnType from './columnType';

export default class PgSmallInt extends ColumnType<number> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'SMALLINT';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: string): number | undefined {
    return value ? parseInt(value, 10) : undefined;
  }
}
