import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlTime extends ColumnType<Date> {
  protected dbName: string;

  public constructor() {
    super();

    this.dbName = "TIME";
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string =>
    `'${value.toTimeString().split(" ")[0]}'`;

  public selectStrategy(value: any): Date {
    return value;
  }
}
