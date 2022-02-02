import ColumnType from './columnType';

export default class PgSerial extends ColumnType<number> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'SERIAL';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: number): number | undefined {
    return value;
  }
}
