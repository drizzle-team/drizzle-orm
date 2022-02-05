/* eslint-disable max-len */
import Expr from './where';

export default class And extends Expr {
  private expressions: Expr[];

  public constructor(expressions: Expr[]) {
    super();
    this.expressions = expressions;
  }

  public toQuery = (position?: number, tableCache?: {[tableName: string]: string}): { query: string, values: Array<any> } => {
    let nextPosition = position || 1;

    const result: string[] = ['('];
    const valuesResult: Array<any> = [];
    for (let i = 0; i < this.expressions.length; i += 1) {
      const expression = this.expressions[i];

      const expressionResult = expression.toQuery(nextPosition, tableCache);

      valuesResult.push(...expressionResult.values);
      result.push(expressionResult.query);

      nextPosition += expressionResult.values.length;

      if (i < this.expressions.length - 1) {
        result.push(' and ');
      }
    }
    result.push(')');

    return { query: result.join(''), values: valuesResult };
  };
}
