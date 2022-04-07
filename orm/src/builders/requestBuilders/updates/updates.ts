/* eslint-disable max-classes-per-file */
import { ISession } from '../../../db/session';

export abstract class UpdateExpr {
  abstract toQuery({
    position, session,
  }:{
    position?: number,
    session: ISession,
  }): { query: string, values: Array<any> };
}

export abstract class UpdateCustomExpr<T> extends UpdateExpr {
  abstract setColumn(column: T): UpdateCustomExpr<T>;
}
