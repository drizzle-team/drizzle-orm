/* eslint-disable max-classes-per-file */
import { Pool, QueryResult } from 'pg';

export abstract class ISession {
  public abstract execute(query: string): Promise<QueryResult<any>>;
}

export default class Session extends ISession {
  public constructor(private pool: Pool) {
    super();
  }

  public execute(query: string): Promise<QueryResult<any>> {
    return this.pool.query(query);
  }
}
