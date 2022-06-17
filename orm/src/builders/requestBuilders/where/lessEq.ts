/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class LessEq extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor({ left, right }: { left: Expr; right: Expr; }) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any> } => {
    const rightPreparedValues = this.right.toQuery({ position, session });
    const leftPreparedValues = this.left.toQuery({ position, session });

    return { query: `${leftPreparedValues.query} <= ${rightPreparedValues.query}`, values: [...leftPreparedValues.values, ...rightPreparedValues.values] };
  };
}
