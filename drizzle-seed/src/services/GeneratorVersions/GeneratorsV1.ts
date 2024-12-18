import { entityKind } from 'drizzle-orm';
import { GenerateInterval, GenerateUniqueInterval } from '../Generators.ts';

export const version = 1;

export class GenerateIntervalV1 extends GenerateInterval {
	static override readonly [entityKind]: string = 'GenerateInterval';
	static override readonly ['version']: number = 1;
	override uniqueVersionOfGen = GenerateUniqueIntervalV1;
}

export class GenerateUniqueIntervalV1 extends GenerateUniqueInterval {
	static override readonly [entityKind]: string = 'GenerateUniqueInterval';
	static override readonly ['version']: number = 1;
}
