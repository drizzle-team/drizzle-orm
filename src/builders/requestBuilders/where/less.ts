import Expr from './where';

export default class Less extends Expr {
  private left: Expr;
  private right: Expr;

  public constructor({ left, right }: { left: Expr; right: Expr; }) {
    super();
    this.left = left;
    this.right = right;
  }

  public toQuery = (): string => `${this.left.toQuery()} < ${this.right.toQuery()}`;
}
