import { entityKind } from '~/entity.ts';
import type { Column } from './column';
import type { ColumnsSelection } from './sql';

export type SelectAsyncGenerator<T extends ColumnsSelection> = AsyncGenerator<TypeFromSelection<T>, TypeFromSelection<T>>;
// export type SelectAsyncIterator<T> = AsyncIterator<T, T>;

export type TypeFromSelection<T extends ColumnsSelection> =
  T extends never ? any : &
    {
      [Key in keyof T]: T[Key] extends Column ? T[Key]['_']['data'] : never;
    } & {}

// export type WithoutPromise<T> = T extends Promise<infer U> ? U : T;
// The AsyncIterable interface is somekind defect
// in TypeScript, so we need to implement it manually.
export abstract class SelectIterator<T extends ColumnsSelection> {
    // TResult!: WithoutPromise<T>;

    static readonly [entityKind]: string = 'SelectIterator';

    [Symbol.toStringTag] = 'SelectIterator';

    abstract iterator(): SelectAsyncGenerator<T>;

    // [Symbol.asyncIterator](): SelectAsyncIterator<T> {
    //      return this.iterator();
    // }

}