import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlDate extends ColumnType<Date> {
  protected dbName: string;

  public constructor() {
    super();

    this.dbName = "DATE";
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string =>
    `${value.getFullYear()}-${value.getUTCMonth() + 1}-${value.getDate()}}`;

  public selectStrategy(value: any): Date {
    return value;
  }
}
