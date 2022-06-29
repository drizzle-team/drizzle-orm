import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlMediumInt extends ColumnType<number> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'MEDIUMINT';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: number): number | undefined {
    if (typeof value === 'string') {
      return value ? parseInt(value, 10) : undefined;
    }
    return value;
  }
}
