/* eslint-disable no-return-assign */
import { ISession } from '../../../db/session';
import { shouldEscape } from '../../../utils/escape';
import Expr from './where';

export default class Const extends Expr {
  private value: any;

  public constructor(value: any) {
    super();
    this.value = value;
  }

  public toQuery = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any>} => {
    const nextPosition = position || 1;
    if (this.value instanceof Date) {
      return { query: session.parametrized(nextPosition), values: [`${this.value.toISOString()}`] };
    }
    if (shouldEscape(this.value)) {
      return { query: session.parametrized(nextPosition), values: [`${this.value.toString()}`] };
    }
    return { query: session.parametrized(nextPosition), values: [this.value] };
  };

  public toQueryV1 = ({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any>} => {
    const nextPosition = position || 1;
    if (this.value instanceof Date) {
      return { query: session.parametrized(nextPosition), values: [`${this.value.toISOString()}`] };
    }
    if (shouldEscape(this.value)) {
      return { query: session.parametrized(nextPosition), values: [`${this.value.toString()}`] };
    }
    return { query: session.parametrized(nextPosition), values: [this.value] };
  };
}
