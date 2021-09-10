// eslint-disable-next-line max-classes-per-file
export default abstract class ColumnType<TCodeType = {}> {
  public codeType: TCodeType;
  protected abstract dbName: string;
  abstract getDbName(): string;
  abstract insertStrategy(value: TCodeType): string;
  abstract selectStrategy(value: any): TCodeType;
}
