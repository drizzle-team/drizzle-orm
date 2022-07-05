import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlTinyInt extends ColumnType<number> {
  public size: number;
  public dbName: string;

  public constructor(size: number) {
    super();

    if (this.size) {
      throw new Error(
        "In numeric size is required"
      );
    }

    this.size = size;

    this.dbName = `TINYINT(${this.size})`;
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: string): number | undefined {
    if (typeof value === 'string') {
        return value ? parseInt(value, 10) : undefined;
      }
      return value;
  }
}
