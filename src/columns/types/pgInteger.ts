import ColumnType from './columnType';

export default class PgInteger extends ColumnType<number> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'INT';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: string): number | undefined {
    return value ? parseInt(value, 10) : undefined;
  }
}
