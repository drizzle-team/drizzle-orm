/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class IsNotNull extends Expr {
  private left: Expr;

  public constructor(left: Expr) {
    super();
    this.left = left;
  }

  public toQuery = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => {
    const leftPreparedValues = this.left.toQuery({ position, tableCache, session });

    return { query: `${leftPreparedValues.query} is not null`, values: leftPreparedValues.values };
  };
}
