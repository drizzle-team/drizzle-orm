/* eslint-disable no-return-assign */
import { shouldEcranate } from '../../../utils/ecranate';
import Expr from './where';

export default class Const extends Expr {
  private value: any;

  public constructor(value: any) {
    super();
    this.value = value;
  }

  public toQuery = (position?: number): { query: string, values: Array<any>} => {
    const nextPosition = position || 1;
    if (this.value instanceof Date) {
      return { query: `$${nextPosition}`, values: [`'${this.value.toISOString()}'`] };
    }
    if (shouldEcranate(this.value)) {
      return { query: `$${nextPosition}`, values: [`'${this.value.toString()}'`] };
    }
    return { query: `$${nextPosition}`, values: [this.value] };
  };
}
