import Expr from './where';

export default class RawWhere extends Expr {
  public constructor(private custom: string) {
    super();
  }

  public toQuery = (): string => this.custom;
}
