export default class Enum<T extends string> {
  public constructor(
    public name: string,
    public values: T[],
  ) {
  }
}

export type ExtractEnumValues<T> = T extends Enum<infer TValues> ? TValues : never;

export function createEnum<T extends string>(
  { alias, values }:{alias: string, values: T[]},
): Enum<T> {
  return new Enum(alias, values);
}
