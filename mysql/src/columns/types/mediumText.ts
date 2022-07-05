import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlMediumText extends ColumnType<string> {
  protected dbName: string;

  public constructor() {
    super();

    this.dbName = "MEDIUMTEXT";
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: string): string => `${value}`;

  public selectStrategy(value: string): string {
    return value;
  }
}
