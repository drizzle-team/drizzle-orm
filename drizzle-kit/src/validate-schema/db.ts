import { getCollisionsByKey, Schema } from './utils';
import { ValidateSchema } from './schema';

export class ValidateDatabase {
  errors: string[] = [];

  validateSchema(schemaName?: string | undefined) {
    return new ValidateSchema(this.errors, schemaName);
  }

  schemaNameCollisions(schemas: Schema[]) {
    const collisions = getCollisionsByKey(schemas, 'schemaName');
    const messages = collisions.map(
      (schema) => `Database has duplicate schema "${schema}"`
    )
    this.errors.push(...messages);
    return this;
  }
}
