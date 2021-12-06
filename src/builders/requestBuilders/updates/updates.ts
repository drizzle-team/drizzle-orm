/* eslint-disable max-classes-per-file */
export abstract class UpdateExpr {
  abstract toQuery(): string;
}

export abstract class UpdateCustomExpr<T> extends UpdateExpr {
  abstract setColumn(column: T): UpdateCustomExpr<T>;
}
