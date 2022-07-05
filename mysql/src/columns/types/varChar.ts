import ColumnType from "drizzle-orm/columns/types/columnType";

export class MySqlVarChar extends ColumnType<string> {
    public size?: number;
    protected dbName: string;
  
    public constructor(size?: number) {
      super();
      this.size = size;
      if (size) {
        this.dbName = `VARCHAR(${size})`;
      } else {
        this.dbName = 'VARCHAR';
      }
    }
  
    public getDbName = (): string => this.dbName;
  
    public insertStrategy = (value: string): string => `${value}`;
  
    public selectStrategy(value: string): string {
      return value;
    }
  }