import { is } from 'drizzle-orm';
import type { Column, DrizzleEntityClass } from 'drizzle-orm';

/** @internal */
export function isAny<T extends DrizzleEntityClass<any>[]>(value: unknown, type: T): value is InstanceType<T[number]> {
  for (let i = 0; i < type.length; i++) {
    if (is(value, type[i]!)) {
      return true;
    }
  }
  return false;
}

/** @internal */
export function isWithEnum(column: Column): column is typeof column & { enumValues: [string, ...string[]] } {
	return 'enumValues' in column && Array.isArray(column.enumValues) && column.enumValues.length > 0;
}
