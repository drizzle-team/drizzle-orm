import { ISession } from "drizzle-orm";
import { ConnectionOptions, FieldPacket } from "mysql2/typings/mysql";
import mysql, { Connection, Pool } from "mysql2/promise";

export class MySqlDialect extends ISession {
  private db: Connection | Pool;

  constructor(private mySqlConfig: ConnectionOptions) {
    super();
  }

  public async _connect() {
    this.db = await mysql.createConnection(this.mySqlConfig);
  }

  public async _connectPool() {
    this.db = mysql.createPool(this.mySqlConfig);
  }

  private async promiseCall(
    query: string,
    values?: Array<any>
  ): Promise<[any, FieldPacket[]]> {
    return this.db.execute(query, values);
  }

  protected async _execute(query: string, values?: Array<any>): Promise<any> {
    const queryResult = await this.promiseCall(query, values);
    return { rows: queryResult[0]};
  }

  public parametrized(): string {
    return "?";
  }

  public escapeStrategy(): string {
    return '`';
  }

  public async closeConnection(): Promise<void> {
    if (!this.db) return;
    await this.db.end();
  }
}
