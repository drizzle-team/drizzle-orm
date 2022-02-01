import Expr from './where';

export default class IsNull extends Expr {
  private left: Expr;

  public constructor(left: Expr) {
    super();
    this.left = left;
  }

  public toQuery = (): { query: string, values: Array<any> } => ({ query: `${this.left.toQuery()} is null`, values: [] });
}
