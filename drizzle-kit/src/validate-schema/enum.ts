import { SchemaValidationErrors, ValidationError } from './errors';
import { entityName, fmtValue, getCollisions } from './utils';

export class ValidateEnum {
  constructor(private errors: ValidationError[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  valueCollisions(enumValues: string[]) {
    const collisions = getCollisions(enumValues);

    if (collisions.length > 0) {
      const errors: ValidationError[] = collisions.map(
        (value) => ({
          message: `Enum ${entityName(this.schema, this.name, true)} has duplicate value ${fmtValue(value, true)}`,
          hint: 'Each value in an enum must be unique. Remove every instance of the conflicting value until only one remains'
        })
      );
      this.errors.push(...errors);
      this.errorCodes.add(SchemaValidationErrors.EnumValueCollisions);
    }

    return this;
  }
}
