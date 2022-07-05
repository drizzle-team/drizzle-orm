import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlTimestamp extends ColumnType<Date> {
  public fsp: number;
  protected dbName: string;

  public constructor(fsp: number) {
    super();

    this.fsp = fsp;

    if (!this.fsp) {
      throw new Error(
        "Timestamp should be set up together with fractional seconds precision"
      );
    }

    if (this.fsp < 0 || fsp > 6) {
      throw new Error(
        "Fractional seconds precision must be in the range 0 to 6"
      );
    }

    this.dbName = `TIMESTAMP(${this.fsp})`;
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: Date): string =>
    `'${value.toISOString().replace("T", " ").replace("Z", " ").trim()}'`;

  public selectStrategy(value: any): Date {
    return value;
  }
}
