import ColumnType from './columnType';

export default class PgEnum<TCodeType extends { [s: number]: string }>
  extends ColumnType<TCodeType> {
  public codeType: TCodeType;
  public dbName: string;
  public name: string;

  public constructor(name: string, dbName:string, codeType: TCodeType) {
    super();
    this.dbName = dbName;
    this.name = name;
    this.codeType = codeType;
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: TCodeType): string => `'${value}'`;
  public selectStrategy(value: any): TCodeType {
    return value;
  }
}
