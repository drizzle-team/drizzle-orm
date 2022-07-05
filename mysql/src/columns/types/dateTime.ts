import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlDateTime extends ColumnType<Date> {
  protected dbName: string;

  public constructor() {
    super();

    this.dbName = "DATETIME";
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string =>
    `'${value.toISOString().replace("T", " ").replace("Z", " ").trim()}'`;

  public selectStrategy(value: any): Date {
    return value;
  }
}
