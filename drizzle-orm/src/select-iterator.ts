import { entityKind } from '~/entity.ts';

export type SelectAsyncGenerator<T> = AsyncGenerator<T, T>;
// export type SelectAsyncIterator<T> = AsyncIterator<T, T>;

// export type WithoutPromise<T> = T extends Promise<infer U> ? U : T;
// The AsyncIterable interface is somekind defect
// in TypeScript, so we need to implement it manually.
export abstract class SelectIterator<T> {
    // TResult!: WithoutPromise<T>;

    static readonly [entityKind]: string = 'SelectIterator';

    [Symbol.toStringTag] = 'SelectIterator';

    abstract iterator(): SelectAsyncGenerator<T>;

    // [Symbol.asyncIterator](): SelectAsyncIterator<T> {
    //      return this.iterator();
    // }

}