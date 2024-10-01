import { SchemaValidationErrors } from './errors';
import { getCollisions } from './utils';

export class ValidateEnum {
  constructor(private errors: string[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  valueCollisions(enumValues: string[]) {
    const collisions = getCollisions(enumValues);

    if (collisions.length > 0) {
      const messages = collisions.map(
        (value) => `Enum ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has duplicate value "${value}"`
      );
      this.errors.push(...messages);
      this.errorCodes.add(SchemaValidationErrors.EnumValueCollisions);
    }

    return this;
  }
}
