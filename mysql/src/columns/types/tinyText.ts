import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlTinyText extends ColumnType<string> {
  protected dbName: string;

  public constructor() {
    super();

    this.dbName = "TINYTEXT";
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: string): string => `${value}`;

  public selectStrategy(value: string): string {
    return value;
  }
}
