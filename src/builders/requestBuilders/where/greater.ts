/* eslint-disable max-len */
import Expr from './where';

export default class Greater extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor({ left, right }: { left: Expr; right: Expr; }) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = (position: number, tableCache?: {[tableName: string]: string}): { query: string, values: Array<any> } => {
    const rightPreparedValues = this.right.toQuery(position, tableCache);
    const leftPreparedValues = this.left.toQuery(position, tableCache);

    return { query: `${leftPreparedValues.query} > ${rightPreparedValues.query}`, values: [...leftPreparedValues.values, ...rightPreparedValues.values] };
  };
}
