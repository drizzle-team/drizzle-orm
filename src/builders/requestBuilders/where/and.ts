import Expr from './where';

export default class And extends Expr {
  private expressions: Expr[];

  public constructor(expressions: Expr[]) {
    super();
    this.expressions = expressions;
  }

  public toQuery = (position?: number): { query: string, values: Array<any> } => {
    let nextPosition = position || 1;

    const result: string[] = ['('];
    const valuesResult: Array<any> = [];
    for (let i = 0; i < this.expressions.length; i += 1) {
      console.log(`nextPosition for AND: ${nextPosition} on iteration ${i}`);
      console.log(`values before ${valuesResult}`);

      const expression = this.expressions[i];

      const expressionResult = expression.toQuery(nextPosition);

      valuesResult.push(...expressionResult.values);
      result.push(expressionResult.query);

      nextPosition += expressionResult.values.length;

      console.log(`values after ${valuesResult}`);
      console.log('\n\n');

      if (i < this.expressions.length - 1) {
        result.push(' and ');
      }
    }
    result.push(')');

    return { query: result.join(''), values: valuesResult };
  };
}
