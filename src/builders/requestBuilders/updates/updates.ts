/* eslint-disable max-classes-per-file */
export abstract class UpdateExpr {
  abstract toQuery(position?: number): { query: string, values: Array<any> };
}

export abstract class UpdateCustomExpr<T> extends UpdateExpr {
  abstract setColumn(column: T): UpdateCustomExpr<T>;
}
