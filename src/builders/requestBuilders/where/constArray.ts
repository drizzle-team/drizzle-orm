import { shouldEcranate } from '../../../utils/ecranate';
import Expr from './where';

export default class ConstArray extends Expr {
  private values: Array<any>;

  public constructor(values: Array<any>) {
    super();
    this.values = values;
  }

  public toQuery = (position?: number): { query: string, values: Array<any> } => {
    let nextPosition = position || 1;

    const finalArray: string[] = [];
    const finalValues: string[] = [];
    for (let i = 0; i < this.values.length; i += 1) {
      const value = this.values[i];
      if (value instanceof Date) {
        finalArray.push(`$${nextPosition}`);
        finalValues.push(`'${value.toISOString()}'`);
      }
      if (shouldEcranate(value)) {
        finalArray.push(`$${nextPosition}`);
        finalValues.push(`'${value.toString()}'`);
      } else {
        finalArray.push(`$${nextPosition}`);
        finalValues.push(value);
      }
      if (i < this.values.length - 1) {
        finalArray.push(',');
      }

      nextPosition += 1;
    }
    return { query: finalArray.join(','), values: finalValues };
  };
}
