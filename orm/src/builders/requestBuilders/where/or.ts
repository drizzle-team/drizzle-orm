/* eslint-disable max-len */
import Expr from './where';
import { ISession } from '../../../db/session';

export default class Or extends Expr {
  private expressions: Expr[];

  public constructor(expressions: Expr[]) {
    super();
    this.expressions = expressions;
  }

  public toQuery = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => {
    let nextPosition = position || 1;

    const result: string[] = ['('];
    const valuesResult: Array<any> = [];
    for (let i = 0; i < this.expressions.length; i += 1) {
      const expression = this.expressions[i];

      const expressionResult = expression.toQuery({ position: nextPosition, tableCache, session });

      valuesResult.push(...expressionResult.values);
      result.push(expressionResult.query);

      nextPosition += expressionResult.values.length;

      if (i < this.expressions.length - 1) {
        result.push(' or ');
      }
    }
    result.push(')');

    return { query: result.join(''), values: valuesResult };
  };
}
