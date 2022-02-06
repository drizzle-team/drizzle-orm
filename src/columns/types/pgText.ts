import ColumnType from './columnType';

export default class PgText extends ColumnType<string> {
  protected dbName: string;

  public constructor() {
    super();
    this.dbName = 'TEXT';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: string): string => `${value.replace(/'/g, "''")}`;

  public selectStrategy(value: string): string {
    return value;
  }
}
