/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable max-classes-per-file */
import { Pool, PoolClient, QueryResult } from 'pg';

export abstract class ISession {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  public constructor() {
  }

  public async execute(query: string, values?: Array<any>): Promise<QueryResult<any>> {
    const error = new Error();
    try {
      return await this._execute(query, values);
    } catch (e) {
      error.message = e.message;
      throw error;
    }
  }

  public abstract parametrized(num: number): string;
  public abstract closeConnection(): Promise<void>;

  protected abstract _execute(query: string, values?: Array<any>): Promise<QueryResult<any>>;
}

export default class Session extends ISession {
  public constructor(private pool: Pool, private connection?: PoolClient) {
    super();
  }

  public parametrized(num: number): string {
    return `$${num}`;
  }

  public async closeConnection(): Promise<void> {
    if (this.connection) {
      this.connection.release();
    }
    await this.pool.end();
  }

  protected async _execute(query: string, values?: Array<any>): Promise<QueryResult<any>> {
    return this.pool.query(query, values || []);
  }
}
