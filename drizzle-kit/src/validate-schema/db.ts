import { getCollisionsByKey, Schema } from './utils';
import { ValidateSchema } from './schema';
import { SchemaValidationErrors } from './errors';

export class ValidateDatabase {
  errors: string[] = [];
  /** Mainly used for testing */
  errorCodes: Set<number> = new Set();

  validateSchema(schemaName?: string | undefined) {
    return new ValidateSchema(this.errors, this.errorCodes, schemaName);
  }

  schemaNameCollisions(schemas: Schema[]) {
    const collisions = getCollisionsByKey(schemas, 'schemaName');
    
    if (collisions.length > 0) {
      const messages = collisions.map(
        (schema) => `Database has duplicate schema "${schema}"`
      );
      this.errors.push(...messages);
      this.errorCodes.add(SchemaValidationErrors.SchemaNameCollisions);
    }

    return this;
  }
}
