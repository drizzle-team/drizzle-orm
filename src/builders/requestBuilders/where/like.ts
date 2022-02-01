import Expr from './where';

export default class Like extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor(left: Expr, right: Expr) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = (position?: number): { query: string, values: Array<any> } => {
    const rightPreparedValues = this.right.toQuery(position);
    const leftPreparedValues = this.left.toQuery(position);

    return { query: `${leftPreparedValues.query} like ${rightPreparedValues.query}`, values: [...leftPreparedValues.values, ...rightPreparedValues.values] };
  };
}
