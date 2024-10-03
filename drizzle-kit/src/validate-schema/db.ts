import { SchemaValidationErrors, ValidationError } from './errors';
import { ValidateSchema } from './schema';
import { fmtValue, getCollisionsByKey, Schema } from './utils';

export class ValidateDatabase {
	errors: ValidationError[] = [];
	/** Mainly used for testing */
	errorCodes: Set<number> = new Set();

	validateSchema(schemaName?: string | undefined) {
		return new ValidateSchema(this.errors, this.errorCodes, schemaName);
	}

	schemaNameCollisions(schemas: Schema[]) {
		const collisions = getCollisionsByKey(schemas, 'schemaName');

		if (collisions.length > 0) {
			const errors: ValidationError[] = collisions.map(
				(schema) => ({
					message: `Database has duplicate schema ${fmtValue(schema, true)}`,
					hint: 'Each schema must have a unique name. Rename any of the conflicting schemas',
				}),
			);
			this.errors.push(...errors);
			this.errorCodes.add(SchemaValidationErrors.SchemaNameCollisions);
		}

		return this;
	}
}
