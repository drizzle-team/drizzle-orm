import { shouldEcranate } from '../../../utils/ecranate';
import Expr from './where';

export default class Const extends Expr {
  private value: any;

  public constructor(value: any) {
    super();
    this.value = value;
  }

  public toQuery = (): string => {
    if (shouldEcranate(this.value)) {
      return `'${this.value.toString()}'`;
    }
    return this.value.toString();
  };
}
