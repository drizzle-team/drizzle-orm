/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class EqWhere extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor(left: Expr, right: Expr) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any>} => {
    const rightPreparedValues = this.right.toQuery({ position, session });
    const leftPreparedValues = this.left.toQuery({ position, session });

    return { query: `${leftPreparedValues.query}=${rightPreparedValues.query}`, values: [...leftPreparedValues.values, ...rightPreparedValues.values] };
  };
}
