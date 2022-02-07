import ColumnType from './columnType';

export default class PgVarChar extends ColumnType<string> {
  public size?: number;
  protected dbName: string;

  public constructor(size?: number) {
    super();
    this.size = size;
    if (size) {
      this.dbName = `character varying(${size})`;
    } else {
      this.dbName = 'character varying';
    }
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: string): string => `${value.replace(/'/g, "''")}`;

  public selectStrategy(value: string): string {
    return value;
  }
}
