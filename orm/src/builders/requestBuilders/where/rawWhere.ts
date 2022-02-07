/* eslint-disable max-len */
import Expr from './where';

export default class RawWhere extends Expr {
  public constructor(private custom: string) {
    super();
  }

  public toQuery = (): { query: string, values: Array<any> } => ({ query: this.custom, values: [] });
}
