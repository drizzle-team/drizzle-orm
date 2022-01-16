import ColumnType from './columnType';

export default class PgTimestamptz extends ColumnType<Date> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'timestamp with time zone';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string => `'${value.toISOString()}'`;

  public selectStrategy(value: any): Date {
    return value;
  }
}
