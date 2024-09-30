import { getCollisions } from './utils';

export class ValidateEnum {
  constructor(private errors: string[], private schema: string | undefined, private name: string) {}

  valueCollisions(enumValues: string[]) {
    const collisions = getCollisions(enumValues);
    const messages = collisions.map(
      (value) => `Enum ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has duplicate value "${value}"`
    );
    this.errors.push(...messages);
    return this;
  }
}
