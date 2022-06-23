/* eslint-disable max-len */
import { ISession } from '../../../db/session';

export default abstract class Expr {
  abstract toQuery({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any> };

  abstract toQueryV1({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> };
}
