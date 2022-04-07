/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable max-classes-per-file */
import { Pool, QueryResult } from 'pg';

export abstract class ISession {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  public constructor() {
  }

  public abstract execute(query: string, values?: Array<any>): Promise<QueryResult<any>>;

  public abstract parametrized(num: number): string;
}

export default class Session extends ISession {
  public constructor(private pool: Pool) {
    super();
  }

  public async execute(query: string, values?: Array<any>): Promise<QueryResult<any>> {
    return this.pool.query(query, values || []);
  }

  public parametrized(num: number): string {
    return `$${num}`;
  }
}
