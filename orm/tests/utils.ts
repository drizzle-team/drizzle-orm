/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */
import { QueryResult } from 'pg';
import { ISession } from '../src/db/session';

export class TestSession extends ISession {
  public _execute(query: string, values?: any[]): Promise<QueryResult<any>> {
    return { rows: [] } as any;
  }

  public parametrized(num: number): string {
    return `$${num}`;
  }

  public async closeConnection(): Promise<void> {
    console.log('connection closed');
  }
}
