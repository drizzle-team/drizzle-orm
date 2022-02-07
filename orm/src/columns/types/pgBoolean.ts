import ColumnType from './columnType';

export default class PgBoolean extends ColumnType<boolean> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'boolean';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: boolean): string => `${value}`;

  public selectStrategy(value: boolean): boolean {
    return value;
  }
}
