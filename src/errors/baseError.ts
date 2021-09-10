/* eslint-disable max-classes-per-file */
export interface Failure {
  type: PgSessionError;
  reason: Error;
}

export enum PgSessionError {
  PgQueryExecutionError,
}

export type Either<L, A> = Left<L, A> | Right<L, A>;

export class Left<L, A> {
  public readonly value: L;

  public constructor(value: L) {
    this.value = value;
  }

  public isLeft(): this is Left<L, A> {
    return true;
  }

  public isRight(): this is Right<L, A> {
    return false;
  }
}

export class Right<L, A> {
  public readonly value: A;

  public constructor(value: A) {
    this.value = value;
  }

  public isLeft(): this is Left<L, A> {
    return false;
  }

  public isRight(): this is Right<L, A> {
    return true;
  }
}

export const left = <L, A>(l: L): Either<L, A> => new Left(l);

export const right = <L, A>(a: A): Either<L, A> => new Right<L, A>(a);
