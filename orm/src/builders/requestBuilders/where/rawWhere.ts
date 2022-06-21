/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class RawWhere extends Expr {
  public constructor(private custom: string) {
    super();
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any> } => ({ query: this.custom, values: [] });

  public toQueryV1 = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => ({ query: this.custom, values: [] });
}
