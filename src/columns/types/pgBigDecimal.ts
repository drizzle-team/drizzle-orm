import ColumnType from './columnType';

export default class PgBigDecimal extends ColumnType<number> {
  public precision?: number;
  public scale?: number;
  public dbName: string;

  public constructor(precision?: number, scale?: number) {
    super();
    this.precision = precision;
    this.scale = scale;
    if (this.scale && !this.precision) {
      throw new Error('In numeric scale should be set up together with precision');
    }
    if (this.precision && !this.scale) {
      this.dbName = `numeric(${this.precision})`;
    } else if (this.precision && this.scale) {
      this.dbName = `numeric(${this.precision},${this.scale})`;
    } else { this.dbName = 'numeric'; }
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: string): number {
    return parseFloat(value);
  }
}
