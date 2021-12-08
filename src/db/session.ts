import { Pool, QueryResult } from 'pg';
import {
  Either, Failure, left, PgSessionError, right,
} from '../errors/baseError';

export default class Session {
  public constructor(private pool: Pool) {
  }

  public execute = async (query: string)
  : Promise<Either<Failure, QueryResult<any>>> => {
    try {
      return right(await this.pool.query(query));
    } catch (e: any) {
      return left({
        type: PgSessionError.PgQueryExecutionError,
        reason: e,
      });
    }
  };
}
