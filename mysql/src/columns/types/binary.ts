import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlBinary extends ColumnType<string> {
    public size?: number;
    protected dbName: string;
  
    public constructor(size?: number) {
      super();
      this.size = size;
      if (size) {
        this.dbName = `BINARY(${size})`;
      } else {
        this.dbName = 'BINARY';
      }
    }
  
    public getDbName = (): string => this.dbName;
  
    public insertStrategy = (value: string): string => `${value}`;
  
    public selectStrategy(value: string): string {
      return value;
    }
  }