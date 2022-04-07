import { UpdateExpr } from './updates';
import { ISession } from '../../../db/session';

export default class Combine extends UpdateExpr {
  private _setters: Array<UpdateExpr>;

  public constructor(setters: Array<UpdateExpr>) {
    super();
    this._setters = setters;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any>} => {
    let nextPosition = position || 1;

    const response = [];
    const valuesResult: Array<any> = [];

    for (let index = 0; index < this._setters.length; index += 1) {
      const setter = this._setters[index];

      const expressionResult = setter.toQuery({ position: nextPosition, session });

      valuesResult.push(...expressionResult.values);
      response.push(expressionResult.query);

      nextPosition += expressionResult.values.length;

      if (index !== this._setters.length - 1) {
        response.push(', ');
      }
    }

    return { query: response.join(''), values: valuesResult };
  };
}
