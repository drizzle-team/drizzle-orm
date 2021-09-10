import Expr from './where';

export default class Or extends Expr {
  private expressions: Expr[];

  public constructor(expressions: Expr[]) {
    super();
    this.expressions = expressions;
  }

  public toQuery = (): string => {
    const result: string[] = ['('];
    for (let i = 0; i < this.expressions.length; i += 1) {
      const expression = this.expressions[i];

      result.push(expression.toQuery());

      if (i < this.expressions.length - 1) {
        result.push(' or ');
      }
    }
    result.push(')');

    return result.join('');
  };
}
