import { shouldEcranate } from '../../../utils/ecranate';
import Expr from './where';
import { ISession } from '../../../db/session';

export default class ConstArray extends Expr {
  private values: Array<any>;

  public constructor(values: Array<any>) {
    super();
    this.values = values;
  }

  public toQuery = ({
    position, tableCache, session,
  }:{
    position?: number,
    tableCache?: {[tableName: string]: string},
    session: ISession,
  }): { query: string, values: Array<any> } => {
    let nextPosition = position || 1;

    const finalArray: string[] = [];
    const finalValues: string[] = [];
    for (let i = 0; i < this.values.length; i += 1) {
      const value = this.values[i];
      if (value instanceof Date) {
        finalArray.push(session.parametrized(nextPosition));
        finalValues.push(`${value.toISOString()}`);
      } else if (shouldEcranate(value)) {
        finalArray.push(session.parametrized(nextPosition));
        finalValues.push(`${value.toString()}`);
      } else {
        finalArray.push(session.parametrized(nextPosition));
        finalValues.push(value);
      }
      if (i < this.values.length - 1) {
        finalArray.push(',');
      }

      nextPosition += 1;
    }
    return { query: finalArray.join(''), values: finalValues };
  };
}
