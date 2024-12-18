import { entityKind } from 'drizzle-orm';
import prand from 'pure-rand';
import { AbstractGenerator, GenerateInterval } from '../Generators.ts';

export const version = 1;

export class GenerateIntervalV1 extends GenerateInterval {
	static override readonly [entityKind]: string = 'GenerateInterval';
	static override readonly ['version']: number = 1;
	override uniqueVersionOfGen = GenerateUniqueIntervalV1;
}

export class GenerateUniqueIntervalV1 extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniqueInterval';

	private state: {
		rng: prand.RandomGenerator;
		intervalSet: Set<string>;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		const maxUniqueIntervalsNumber = 6 * 13 * 29 * 25 * 61 * 61;
		if (count > maxUniqueIntervalsNumber) {
			throw new RangeError(`count exceeds max number of unique intervals(${maxUniqueIntervalsNumber})`);
		}

		const rng = prand.xoroshiro128plus(seed);
		const intervalSet = new Set<string>();
		this.state = { rng, intervalSet };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let yearsNumb: number,
			monthsNumb: number,
			daysNumb: number,
			hoursNumb: number,
			minutesNumb: number,
			secondsNumb: number;

		let interval = '';

		for (;;) {
			[yearsNumb, this.state.rng] = prand.uniformIntDistribution(0, 5, this.state.rng);
			[monthsNumb, this.state.rng] = prand.uniformIntDistribution(0, 12, this.state.rng);
			[daysNumb, this.state.rng] = prand.uniformIntDistribution(1, 29, this.state.rng);
			[hoursNumb, this.state.rng] = prand.uniformIntDistribution(0, 24, this.state.rng);
			[minutesNumb, this.state.rng] = prand.uniformIntDistribution(0, 60, this.state.rng);
			[secondsNumb, this.state.rng] = prand.uniformIntDistribution(0, 60, this.state.rng);

			interval = `${yearsNumb === 0 ? '' : `${yearsNumb} years `}`
				+ `${monthsNumb === 0 ? '' : `${monthsNumb} months `}`
				+ `${daysNumb === 0 ? '' : `${daysNumb} days `}`
				+ `${hoursNumb === 0 ? '' : `${hoursNumb} hours `}`
				+ `${minutesNumb === 0 ? '' : `${minutesNumb} minutes `}`
				+ `${secondsNumb === 0 ? '' : `${secondsNumb} seconds`}`;

			if (!this.state.intervalSet.has(interval)) {
				this.state.intervalSet.add(interval);
				break;
			}
		}

		return interval;
	}
}

export class GenerateStringV1 extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly [entityKind]: string = 'GenerateString';

	private state: { rng: prand.RandomGenerator } | undefined;
	override uniqueVersionOfGen = GenerateUniqueStringV1;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const minStringLength = 7;
		const maxStringLength = 20;
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

export class GenerateUniqueStringV1 extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueString';

	private state: { rng: prand.RandomGenerator } | undefined;
	public override isUnique = true;

	override init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng };
	}

	generate({ i }: { i: number }) {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const minStringLength = 7;
		const maxStringLength = 20;
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

		return currStr.slice(0, 4) + uniqueStr + currStr.slice(4);
	}
}
