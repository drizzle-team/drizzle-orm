import ColumnType from './columnType';

export default class PgEnum<TCodeType> extends ColumnType {
  public codeType: TCodeType;
  public dbName: string;

  public constructor(dbName: string) {
    super();
    this.dbName = dbName;
  }

  public getDbName = (): string => this.dbName;
  public insertStrategy = (value: TCodeType): string => `${value}`;
  public selectStrategy(value: any): TCodeType {
    return value;
  }
}
