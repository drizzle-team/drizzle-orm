/**
 * To avoid a potential `Maximum call stack size exceeded` error with `Array.push(...items)`, we use push one element at a time.
 * Please note that there is a same function in `drizzle-orm/src/utils.ts`, `drizzle-kit/src/utils.ts#push_array`.
 */
export function push_array<T>(array: T[], items: T[]): void {
  // eslint-disable-next-line unicorn/no-for-loop -- for is faster than for of
  for (let i = 0; i < items.length; i++) {
    array.push(items[i]!);
  }
}
