/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class NotEqWhere extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor(left: Expr, right: Expr) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => {
    const rightPreparedValues = this.right.toQuery({ position, tableCache, session });
    const leftPreparedValues = this.left.toQuery({ position, tableCache, session });

    return { query: `${leftPreparedValues.query}!=${rightPreparedValues.query}`, values: [...leftPreparedValues.values, ...rightPreparedValues.values] };
  };
}
