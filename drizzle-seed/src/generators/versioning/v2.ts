/* eslint-disable drizzle-internal/require-entity-kind */
import prand from 'pure-rand';
import { AbstractGenerator } from '../Generators.ts';

export type GenerateUniqueIntervalV2T = {
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
};
export class GenerateUniqueIntervalV2 extends AbstractGenerator<GenerateUniqueIntervalV2T> {
	static override readonly 'entityKind': string = 'GenerateUniqueInterval';
	static override readonly version: number = 2;

	private state: {
		rng: prand.RandomGenerator;
		fieldsToGenerate: string[];
		intervalSet: Set<string>;
	} | undefined;
	public override isGeneratorUnique = true;
	public override maxUniqueCount: number;

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

	public fieldsToGenerate: string[];

	constructor(params?: GenerateUniqueIntervalV2T) {
		super(params);

		const allFields = ['year', 'month', 'day', 'hour', 'minute', 'second'];
		this.fieldsToGenerate = allFields;

		if (this.params.fields !== undefined && this.params.fields?.includes(' to ')) {
			const tokens = this.params.fields.split(' to ');
			const endIdx = allFields.indexOf(tokens[1]!);
			this.fieldsToGenerate = allFields.slice(0, endIdx + 1);
		} else if (this.params.fields !== undefined) {
			const endIdx = allFields.indexOf(this.params.fields);
			this.fieldsToGenerate = allFields.slice(0, endIdx + 1);
		}

		this.maxUniqueCount = 1;
		for (const field of this.fieldsToGenerate) {
			const from = this.config[field]!.from, to = this.config[field]!.to;
			this.maxUniqueCount *= from - to + 1;
		}
	}

	override init({ count, seed }: { count: number; seed: number }) {
		if (count > this.maxUniqueCount) {
			throw new RangeError(`count exceeds max number of unique intervals(${this.maxUniqueCount})`);
		}

		const rng = prand.xoroshiro128plus(seed);
		const intervalSet = new Set<string>();
		this.state = { rng, fieldsToGenerate: this.fieldsToGenerate, intervalSet };
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

// TODO need to rework this generator
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
		if (this.typeParams?.length !== undefined) {
			maxStringLength = this.typeParams?.length;
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

		if (this.dataType === 'object') return Buffer.from(currStr);
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
	public override isGeneratorUnique = true;
	public maxStringLength: number = 20;
	public minStringLength: number = 7;

	override getMaxUniqueCount(): number {
		if (this.maxUniqueCount >= 0) return this.maxUniqueCount;

		this.maxStringLength = this.typeParams?.length ?? this.maxStringLength;
		this.maxUniqueCount = Number.parseInt('f'.repeat(this.maxStringLength), 16);
		return this.maxUniqueCount;
	}

	override init({ seed, count }: { seed: number; count: number }) {
		const rng = prand.xoroshiro128plus(seed);

		// TODO: revise later
		this.maxStringLength = this.typeParams?.length ?? this.maxStringLength;
		if (this.maxStringLength === 1 || this.maxStringLength < this.minStringLength) {
			this.minStringLength = this.maxStringLength;
		}

		if (count > this.getMaxUniqueCount()) {
			throw new Error(
				`You can't generate ${count} unique strings, with a maximum string length of ${this.maxStringLength}.`,
			);
		}

		this.state = { rng, minStringLength: this.minStringLength, maxStringLength: this.maxStringLength };
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

		if (this.dataType === 'object') return Buffer.from(uniqueStr + currStr);
		return uniqueStr + currStr;
	}
}
