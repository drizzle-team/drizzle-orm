/* eslint-disable drizzle-internal/require-entity-kind */
import prand from 'pure-rand';
import { AbstractGenerator } from '../Generators.ts';

export class GenerateUniqueIntervalV2 extends AbstractGenerator<{
	fields?:
		| 'year'
		| 'month'
		| 'day'
		| 'hour'
		| 'minute'
		| 'second'
		| 'year to month'
		| 'day to hour'
		| 'day to minute'
		| 'day to second'
		| 'hour to minute'
		| 'hour to second'
		| 'minute to second';
	isUnique?: boolean;
}> {
	static override readonly 'entityKind': string = 'GenerateUniqueInterval';
	static override readonly version: number = 2;

	private state: {
		rng: prand.RandomGenerator;
		fieldsToGenerate: string[];
		intervalSet: Set<string>;
	} | undefined;
	public override isUnique = true;
	private config: { [key: string]: { from: number; to: number } } = {
		year: {
			from: 0,
			to: 5,
		},
		month: {
			from: 0,
			to: 11,
		},
		day: {
			from: 0,
			to: 29,
		},
		hour: {
			from: 0,
			to: 23,
		},
		minute: {
			from: 0,
			to: 59,
		},
		second: {
			from: 0,
			to: 59,
		},
	};

	override init({ count, seed }: { count: number; seed: number }) {
		const allFields = ['year', 'month', 'day', 'hour', 'minute', 'second'];
		let fieldsToGenerate: string[] = allFields;

		if (this.params.fields !== undefined && this.params.fields?.includes(' to ')) {
			const tokens = this.params.fields.split(' to ');
			const endIdx = allFields.indexOf(tokens[1]!);
			fieldsToGenerate = allFields.slice(0, endIdx + 1);
		} else if (this.params.fields !== undefined) {
			const endIdx = allFields.indexOf(this.params.fields);
			fieldsToGenerate = allFields.slice(0, endIdx + 1);
		}

		let maxUniqueIntervalsNumber = 1;
		for (const field of fieldsToGenerate) {
			const from = this.config[field]!.from, to = this.config[field]!.to;
			maxUniqueIntervalsNumber *= from - to + 1;
		}

		if (count > maxUniqueIntervalsNumber) {
			throw new RangeError(`count exceeds max number of unique intervals(${maxUniqueIntervalsNumber})`);
		}

		const rng = prand.xoroshiro128plus(seed);
		const intervalSet = new Set<string>();
		this.state = { rng, fieldsToGenerate, intervalSet };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let interval, numb: number;

		for (;;) {
			interval = '';

			for (const field of this.state.fieldsToGenerate) {
				const from = this.config[field]!.from, to = this.config[field]!.to;
				[numb, this.state.rng] = prand.uniformIntDistribution(from, to, this.state.rng);
				interval += `${numb} ${field} `;
			}

			if (!this.state.intervalSet.has(interval)) {
				this.state.intervalSet.add(interval);
				break;
			}
		}

		return interval;
	}
}

export class GenerateStringV2 extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly 'entityKind': string = 'GenerateString';
	static override readonly version: number = 2;

	private state: {
		rng: prand.RandomGenerator;
		minStringLength: number;
		maxStringLength: number;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueStringV2;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		let minStringLength = 7;
		let maxStringLength = 20;
		if (this.stringLength !== undefined) {
			maxStringLength = this.stringLength;
			if (maxStringLength === 1) minStringLength = maxStringLength;
			if (maxStringLength < minStringLength) minStringLength = 1;
		}

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng, minStringLength, maxStringLength };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const minStringLength = this.state.minStringLength,
			maxStringLength = this.state.maxStringLength;
		const stringChars = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		let idx: number,
			strLength: number,
			currStr: string;

		currStr = '';
		[strLength, this.state.rng] = prand.uniformIntDistribution(
			minStringLength,
			maxStringLength,
			this.state.rng,
		);
		for (let j = 0; j < strLength; j++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(
				0,
				stringChars.length - 1,
				this.state.rng,
			);
			currStr += stringChars[idx];
		}
		return currStr;
	}
}

export class GenerateUniqueStringV2 extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly 'entityKind': string = 'GenerateUniqueString';
	static override readonly version: number = 2;

	private state: {
		rng: prand.RandomGenerator;
		minStringLength: number;
		maxStringLength: number;
	} | undefined;
	public override isUnique = true;

	override init({ seed, count }: { seed: number; count: number }) {
		const rng = prand.xoroshiro128plus(seed);

		let minStringLength = 7;
		let maxStringLength = 20;
		// TODO: revise later
		if (this.stringLength !== undefined) {
			maxStringLength = this.stringLength;
			if (maxStringLength === 1 || maxStringLength < minStringLength) minStringLength = maxStringLength;
		}

		if (maxStringLength < count.toString(16).length) {
			throw new Error(
				`You can't generate ${count} unique strings, with a maximum string length of ${maxStringLength}.`,
			);
		}

		this.state = { rng, minStringLength, maxStringLength };
	}

	generate({ i }: { i: number }) {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const minStringLength = this.state.minStringLength,
			maxStringLength = this.state.maxStringLength;
		const stringChars = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		let idx: number,
			strLength: number;
		let currStr: string;

		currStr = '';
		const uniqueStr = i.toString(16);
		[strLength, this.state.rng] = prand.uniformIntDistribution(
			minStringLength,
			maxStringLength - uniqueStr.length,
			this.state.rng,
		);
		for (let j = 0; j < strLength - uniqueStr.length; j++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(
				0,
				stringChars.length - 1,
				this.state.rng,
			);
			currStr += stringChars[idx];
		}

		return uniqueStr + currStr;
	}
}
