/* eslint-disable max-len */
import Expr from './where';

export default class IsNotNull extends Expr {
  private left: Expr;

  public constructor(left: Expr) {
    super();
    this.left = left;
  }

  public toQuery = (position?: number, tableCache?: {[tableName: string]: string}): { query: string, values: Array<any> } => {
    const leftPreparedValues = this.left.toQuery(position, tableCache);

    return { query: `${leftPreparedValues.query} is not null`, values: leftPreparedValues.values };
  };
}
