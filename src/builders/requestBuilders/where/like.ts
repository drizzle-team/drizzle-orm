import Expr from './where';

export default class Like extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor(left: Expr, right: Expr) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = (): string => `${this.left.toQuery()} like ${this.right.toQuery()}`;
}
