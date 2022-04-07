import { ISession } from '../../../db/session';

export default abstract class Expr {
  abstract toQuery({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> };
}
