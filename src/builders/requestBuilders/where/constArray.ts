import { shouldEcranate } from '../../../utils/ecranate';
import Expr from './where';

export default class ConstArray extends Expr {
  private values: Array<any>;

  public constructor(values: Array<any>) {
    super();
    this.values = values;
  }

  public toQuery = (): string => {
    const finalArray: string[] = [];
    for (let i = 0; i < this.values.length; i += 1) {
      const value = this.values[i];
      if (shouldEcranate(value)) {
        finalArray.push(`'${value.toString()}'`);
      } else {
        finalArray.push(value.toString());
      }
      if (i < this.values.length - 1) {
        finalArray.push(',');
      }
    }
    return finalArray.join('');
  };
}
