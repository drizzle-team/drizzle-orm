import Expr from './where';

export default class In extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor(left: Expr, right: Expr) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = (): { query: string, values: Array<any> } => ({ query: `${this.left.toQuery()} in (${this.right.toQuery()})`, values: [] });
}
