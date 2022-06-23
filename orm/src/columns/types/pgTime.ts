import ColumnType from './columnType';

export default class PgTime extends ColumnType<Date> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'time without time zone';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string => value.toISOString();

  public selectStrategy(value: any): Date {
    return value;
  }
}
