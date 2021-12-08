import Expr from './where';

export default class IsNull extends Expr {
  private left: Expr;

  public constructor(left: Expr) {
    super();
    this.left = left;
  }

  public toQuery = (): string => `${this.left.toQuery()} is null`;
}
