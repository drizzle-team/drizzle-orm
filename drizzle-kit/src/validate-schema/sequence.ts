import { SchemaValidationErrors, ValidationError } from './errors';
import { entityName, fmtValue, Sequence } from './utils';

export class ValidateSequence {
  constructor(private errors: ValidationError[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  incorrectvalues(sequence: Sequence) {
    let { increment, maxValue, minValue } = sequence.seqOptions ?? {};
    increment ??= 1;
    const baseMessage = `Sequence ${entityName(this.schema, this.name)} `;

    if (Number(increment) === 0) {
      this.errors.push({
        message: `${baseMessage}is set to increment by ${fmtValue('0', false)}`,
        hint: 'Sequences must increment by a non-zero value. Set the increment value to one that is greater or less than zero'
      });
      this.errorCodes.add(SchemaValidationErrors.SequenceIncrementByZero)
    }

    if (minValue && maxValue && Number(minValue) > Number(maxValue)) {
      this.errors.push({
        message: `${baseMessage}has a minimum value greater than its max value`,
        hint: 'Sequences must have a minimum value that is less than or equal to its maximum value'
      });
      this.errorCodes.add(SchemaValidationErrors.SequenceInvalidMinMax);
    }

    return this;
  }
}
