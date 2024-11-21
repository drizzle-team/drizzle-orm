import { entityKind } from 'drizzle-orm';
import prand from 'pure-rand';
import adjectives from '../datasets/adjectives.ts';
import cityNames from '../datasets/cityNames.ts';
import companyNameSuffixes from '../datasets/companyNameSuffixes.ts';
import countries from '../datasets/countries.ts';
import emailDomains from '../datasets/emailDomains.ts';
import firstNames from '../datasets/firstNames.ts';
import jobsTitles from '../datasets/jobsTitles.ts';
import lastNames from '../datasets/lastNames.ts';
import loremIpsumSentences from '../datasets/loremIpsumSentences.ts';
import phonesInfo from '../datasets/phonesInfo.ts';
import states from '../datasets/states.ts';
import streetSuffix from '../datasets/streetSuffix.ts';
import { fastCartesianProduct, fillTemplate, getWeightedIndices } from './utils.ts';

export abstract class AbstractGenerator<T = {}> {
	static readonly [entityKind]: string = 'AbstractGenerator';

	public isUnique = false;
	public notNull = false;
	public uniqueVersionOfGen?: new(params: T) => AbstractGenerator<T>;
	public dataType?: string;
	public timeSpent?: number;

	constructor(public params: T) {}

	abstract init(params: { count: number | { weight: number; count: number | number[] }[]; seed: number }): void;

	abstract generate(params: { i: number }): number | string | boolean | unknown | undefined | void;
}

function createGenerator<GeneratorType extends AbstractGenerator<T>, T>(
	generatorConstructor: new(params: T) => GeneratorType,
) {
	return (
		...args: GeneratorType extends GenerateValuesFromArray | GenerateDefault | WeightedRandomGenerator ? [T]
			: ([] | [T])
	): GeneratorType => {
		let params = args[0];
		if (params === undefined) params = {} as T;
		return new generatorConstructor(params);
	};
}

// Generators Classes -----------------------------------------------------------------------------------------------------------------------
export class GenerateWeightedCount extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateWeightedCount';

	private state: {
		rng: prand.RandomGenerator;
		weightedIndices: number[];
		weightedCount: { weight: number; count: number | number[] }[];
	} | undefined;

	init({ seed, count }: { count: { weight: number; count: number | number[] }[]; seed: number }) {
		const rng = prand.xoroshiro128plus(seed);
		const weightedIndices = getWeightedIndices(count.map((val) => val.weight));
		this.state = { rng, weightedIndices, weightedCount: count };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		// logic for this generator
		let idx: number;
		const weightedCount = this.state.weightedCount;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.weightedIndices.length - 1, this.state.rng);
		const objIdx = this.state.weightedIndices[idx] as number;

		if (typeof weightedCount[objIdx]!.count === 'number') {
			return weightedCount[objIdx]!.count as number;
		} else {
			// typeof weightedCount[objIdx]!.count === 'object' // number[]
			const possCounts = weightedCount[objIdx]!.count as number[];
			[idx, this.state.rng] = prand.uniformIntDistribution(0, possCounts.length - 1, this.state.rng);
			return possCounts[idx]!;
		}
	}
}

export class HollowGenerator extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'HollowGenerator';

	init() {}

	generate() {}
}

export class GenerateDefault extends AbstractGenerator<{
	defaultValue: unknown;
}> {
	static override readonly [entityKind]: string = 'GenerateDefault';

	init() {}

	generate() {
		return this.params.defaultValue;
	}
}

export class GenerateValuesFromArray extends AbstractGenerator<
	{
		values:
			| (number | string | boolean | undefined)[]
			| { weight: number; values: (number | string | boolean | undefined)[] }[];
		isUnique?: boolean;
	}
> {
	static override readonly [entityKind]: string = 'GenerateValuesFromArray';

	public weightedCountSeed: number | undefined = undefined;
	public maxRepeatedValuesCount?: number | { weight: number; count: number | number[] }[] = undefined;
	private state: {
		rng: prand.RandomGenerator;
		values:
			| (number | string | boolean | undefined)[]
			| { weight: number; values: (number | string | boolean | undefined)[] }[];
		genIndicesObj: GenerateUniqueInt | undefined;
		genIndicesObjList: GenerateUniqueInt[] | undefined;
		valuesWeightedIndices: number[] | undefined;
		genMaxRepeatedValuesCount: GenerateDefault | GenerateWeightedCount | undefined;
	} | undefined;
	public override timeSpent: number = 0;

	checks({ count }: { count: number }) {
		const { values } = this.params;
		const { maxRepeatedValuesCount, notNull, isUnique } = this;
		if (values.length === 0) {
			throw new Error('values length equals zero.');
		}

		if (
			typeof values[0] === 'object'
			&& !(values as { weight: number; values: any[] }[]).every((val) => val.values.length !== 0)
		) {
			throw new Error('one of weighted values length equals zero.');
		}

		if (
			maxRepeatedValuesCount !== undefined && (
				(typeof maxRepeatedValuesCount === 'number' && maxRepeatedValuesCount <= 0)
				|| (typeof maxRepeatedValuesCount === 'object' && !maxRepeatedValuesCount
					.every((obj) =>
						(typeof obj.count) === 'number'
							? (obj.count as number) > 0
							: (obj.count as number[]).every((count) => count > 0)
					))
			)
		) {
			throw new Error('maxRepeatedValuesCount should be greater than zero.');
		}

		let allValuesCount = values.length;
		if (typeof values[0] === 'object') {
			allValuesCount = (values as { values: any[] }[]).reduce((acc, currVal) => acc + currVal.values.length, 0);
		}

		if (
			notNull === true
			&& maxRepeatedValuesCount !== undefined
			&& (
				(typeof values[0] !== 'object' && typeof maxRepeatedValuesCount === 'number'
					&& maxRepeatedValuesCount * values.length < count)
				|| (typeof values[0] === 'object' && typeof maxRepeatedValuesCount === 'number'
					&& maxRepeatedValuesCount * allValuesCount < count)
			)
		) {
			throw new Error("(maxRepeatedValuesCount * values.length) < count. can't fill notNull column with null values.");
		}

		if (
			isUnique === true && maxRepeatedValuesCount !== undefined && (
				(typeof maxRepeatedValuesCount === 'number' && maxRepeatedValuesCount > 1)
				|| (typeof maxRepeatedValuesCount === 'object' && !maxRepeatedValuesCount
					.every((obj) =>
						(typeof obj.count) === 'number'
							? obj.count === 1
							: (obj.count as number[]).every((count) => count === 1)
					))
			)
		) {
			throw new Error("maxRepeatedValuesCount can't be greater than 1 if column is unique.");
		}

		if (
			isUnique === true && notNull === true && (
				(typeof values[0] !== 'object' && values.length < count)
				|| (typeof values[0] === 'object' && allValuesCount < count)
			)
		) {
			// console.log(maxRepeatedValuesCount, values.length, allValuesCount, count)
			throw new Error('there are no enough values to fill unique column.');
		}
	}

	init({ count, seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}
		this.checks({ count });

		let { maxRepeatedValuesCount } = this;
		const { params, isUnique, notNull, weightedCountSeed } = this;

		const values = params.values;

		let valuesWeightedIndices;
		if (typeof values[0] === 'object') {
			valuesWeightedIndices = getWeightedIndices((values as { weight: number }[]).map((val) => val.weight));
			if (isUnique === true && notNull === true) {
				let idx: number, valueIdx: number, rng = prand.xoroshiro128plus(seed);
				const indicesCounter: { [key: number]: number } = {};
				for (let i = 0; i < count; i++) {
					[idx, rng] = prand.uniformIntDistribution(0, valuesWeightedIndices.length - 1, rng);
					valueIdx = valuesWeightedIndices[idx]!;
					if (!Object.hasOwn(indicesCounter, valueIdx)) indicesCounter[valueIdx] = 0;
					indicesCounter[valueIdx]! += 1;
				}

				for (const [idx, value] of values.entries()) {
					if ((value as { values: (number | string | boolean | undefined)[] }).values.length < indicesCounter[idx]!) {
						throw new Error(
							'weighted values arrays is too small to generate values with specified probability for unique not null column.'
								+ `it's planned to generate: ${
									Object.entries(indicesCounter).map(([idx, count]) => {
										return `${count} values with probability ${(values as { weight: number }[])[Number(idx)]?.weight}`;
									}).join(',')
								}`,
						);
					}
				}
			}
		}
		if (isUnique === true && maxRepeatedValuesCount === undefined) {
			maxRepeatedValuesCount = 1;
		}
		let genMaxRepeatedValuesCount: GenerateDefault | GenerateWeightedCount | undefined;
		if (typeof maxRepeatedValuesCount === 'number') {
			genMaxRepeatedValuesCount = new GenerateDefault({ defaultValue: maxRepeatedValuesCount });
		} else if (typeof maxRepeatedValuesCount === 'object') {
			genMaxRepeatedValuesCount = new GenerateWeightedCount({});
			(genMaxRepeatedValuesCount as GenerateWeightedCount).init(
				{
					count: maxRepeatedValuesCount,
					seed: weightedCountSeed === undefined ? seed : weightedCountSeed,
				},
			);
		}

		let genIndicesObj: GenerateUniqueInt | undefined;
		let genIndicesObjList: GenerateUniqueInt[] | undefined;

		if (maxRepeatedValuesCount !== undefined) {
			if (typeof values[0] !== 'object') {
				genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: values.length - 1 });
				genIndicesObj.genMaxRepeatedValuesCount = genMaxRepeatedValuesCount;
				genIndicesObj.skipCheck = true;
				genIndicesObj.init({ count, seed });
			} else if (typeof values[0] === 'object') {
				genIndicesObjList = [];
				for (const obj of values as { weight: number; values: (number | string | boolean | undefined)[] }[]) {
					const genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: obj.values.length - 1 });
					genIndicesObj.genMaxRepeatedValuesCount = genMaxRepeatedValuesCount;
					genIndicesObj.skipCheck = true;
					genIndicesObj.init({ count, seed });
					genIndicesObjList.push(genIndicesObj);
				}
			}
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng, values, valuesWeightedIndices, genMaxRepeatedValuesCount, genIndicesObj, genIndicesObjList };
	}

	generate() {
		const t0 = new Date();

		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number,
			value: string | number | boolean | undefined;
		let valueIdx: number;

		if (this.state.valuesWeightedIndices === undefined) {
			if (this.state.genIndicesObj === undefined) {
				[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.values.length - 1, this.state.rng);
			} else {
				idx = this.state.genIndicesObj.generate() as number;
			}

			value = (this.state.values as (number | string | boolean | undefined)[])[idx];
		} else {
			// weighted values
			[idx, this.state.rng] = prand.uniformIntDistribution(
				0,
				this.state.valuesWeightedIndices.length - 1,
				this.state.rng,
			);
			valueIdx = this.state.valuesWeightedIndices[idx] as number;
			const currValues =
				(this.state.values![valueIdx] as { weight: number; values: (number | string | boolean | undefined)[] }).values;
			if (this.state.genIndicesObjList === undefined) {
				// isUnique !== true
				[idx, this.state.rng] = prand.uniformIntDistribution(0, currValues.length - 1, this.state.rng);
			} else {
				// isUnique === true
				idx = this.state.genIndicesObjList[valueIdx]!.generate() as number;
			}
			value = currValues[idx];
		}

		this.timeSpent += (Date.now() - t0.getTime()) / 1000;
		return value;
	}
}

export class GenerateSelfRelationsValuesFromArray extends AbstractGenerator<{ values: (number | string | boolean)[] }> {
	static override readonly [entityKind]: string = 'GenerateSelfRelationsValuesFromArray';

	private state: {
		rng: prand.RandomGenerator;
		firstValuesCount: number;
		firstValues: (string | number | boolean)[];
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		let rng = prand.xoroshiro128plus(seed);

		// generate 15-40 % values with the same value as reference column
		let percent = 30;
		[percent, rng] = prand.uniformIntDistribution(20, 40, rng);
		const firstValuesCount = Math.floor((percent / 100) * count), firstValues: (string | number | boolean)[] = [];

		this.state = { rng, firstValuesCount, firstValues };
	}

	generate({ i }: { i: number }) {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const { values } = this.params;
		let idx: number;

		if (i < this.state.firstValuesCount) {
			this.state.firstValues.push(values[i]!);
			return values[i];
		} else {
			[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.firstValues.length - 1, this.state.rng);
			return this.state.firstValues[idx];
		}
	}
}

export class GenerateIntPrimaryKey extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateIntPrimaryKey';

	public maxValue?: number | bigint;

	init({ count }: { count: number; seed: number }) {
		if (this.maxValue !== undefined && count > this.maxValue) {
			throw new Error('count exceeds max number for this column type.');
		}
	}

	generate({ i }: { i: number }) {
		if (this.dataType === 'bigint') {
			return BigInt(i + 1);
		}

		return i + 1;
	}
}

export class GenerateNumber extends AbstractGenerator<
	{
		minValue?: number;
		maxValue?: number;
		precision?: number;
		isUnique?: boolean;
	} | undefined
> {
	static override readonly [entityKind]: string = 'GenerateNumber';

	private state: {
		rng: prand.RandomGenerator;
		minValue: number;
		maxValue: number;
		precision: number;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueNumber;

	init({ seed }: { seed: number }) {
		if (this.params === undefined) this.params = {};

		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		let { minValue, maxValue, precision } = this.params;
		if (precision === undefined) {
			precision = 100;
		}

		if (maxValue === undefined) {
			maxValue = precision * 1000;
		} else {
			maxValue *= precision;
		}

		if (minValue === undefined) {
			minValue = -maxValue;
		} else {
			minValue *= precision;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng, minValue, maxValue, precision };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let value: number;

		[value, this.state.rng] = prand.uniformIntDistribution(this.state.minValue, this.state.maxValue, this.state.rng);
		return value / this.state.precision;
	}
}

export class GenerateUniqueNumber extends AbstractGenerator<
	{
		minValue?: number;
		maxValue?: number;
		precision?: number;
		isUnique?: boolean;
	} | undefined
> {
	static override readonly [entityKind]: string = 'GenerateUniqueNumber';

	private state: {
		genUniqueIntObj: GenerateUniqueInt;
		minValue: number;
		maxValue: number;
		precision: number;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		if (this.params === undefined) this.params = {};
		let { minValue, maxValue, precision } = this.params;

		if (precision === undefined) {
			precision = 100;
		}

		if (maxValue === undefined) {
			maxValue = count * precision;
		} else {
			maxValue *= precision;
		}

		if (minValue === undefined) {
			minValue = -maxValue;
		} else {
			minValue *= precision;
		}

		const genUniqueIntObj = new GenerateUniqueInt({ minValue, maxValue });
		genUniqueIntObj.init({ count, seed });

		this.state = { genUniqueIntObj, minValue, maxValue, precision };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const value = this.state.genUniqueIntObj.generate() as number / this.state.precision;

		return value;
	}
}

export class GenerateInt extends AbstractGenerator<{
	minValue?: number | bigint;
	maxValue?: number | bigint;
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateInt';

	private state: {
		rng: prand.RandomGenerator;
		minValue: number | bigint;
		maxValue: number | bigint;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueInt;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		let { minValue, maxValue } = this.params;

		if (maxValue === undefined) {
			maxValue = 1000;
		}

		if (minValue === undefined) {
			minValue = -maxValue;
		}

		if (typeof minValue === 'number' && typeof maxValue === 'number') {
			minValue = minValue >= 0 ? Math.ceil(minValue) : Math.floor(minValue);
			maxValue = maxValue >= 0 ? Math.floor(maxValue) : Math.ceil(maxValue);
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng, minValue, maxValue };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let value: number | bigint;
		if (typeof this.state.minValue === 'bigint' && typeof this.state.maxValue === 'bigint') {
			[value, this.state.rng] = prand.uniformBigIntDistribution(
				this.state.minValue,
				this.state.maxValue,
				this.state.rng,
			);
		} else {
			[value, this.state.rng] = prand.uniformIntDistribution(
				this.state.minValue as number,
				this.state.maxValue as number,
				this.state.rng,
			);
		}

		if (this.dataType === 'string') {
			return String(value);
		}

		if (this.dataType === 'bigint') {
			value = BigInt(value);
		}
		return value;
	}
}

export class GenerateUniqueInt extends AbstractGenerator<{
	minValue?: number | bigint;
	maxValue?: number | bigint;
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniqueInt';

	public genMaxRepeatedValuesCount: GenerateDefault | GenerateWeightedCount | undefined;
	public skipCheck?: boolean = false;
	public state: {
		rng: prand.RandomGenerator;
		minValue: number | bigint;
		maxValue: number | bigint;
		intervals: (number | bigint)[][];
		integersCount: Map<number | bigint, number>;
	} | undefined;
	public override isUnique = true;
	public override timeSpent = 0;

	init({ count, seed }: { count: number; seed: number }) {
		const rng = prand.xoroshiro128plus(seed);
		let { minValue, maxValue } = this.params;

		if (maxValue === undefined) {
			maxValue = count * 10;
		}
		if (minValue === undefined) {
			minValue = -maxValue;
		}

		const intervals = [[minValue, maxValue]];

		const integersCount = new Map();

		if (typeof minValue === 'bigint' && typeof maxValue === 'bigint') {
			if (this.skipCheck === false && maxValue - minValue + BigInt(1) < count) {
				throw new Error(
					'count exceeds max number of unique integers in given range(min, max), try to make range wider.',
				);
			}
		} else if (typeof minValue === 'number' && typeof maxValue === 'number') {
			minValue = minValue >= 0 ? Math.ceil(minValue) : Math.floor(minValue);
			maxValue = maxValue >= 0 ? Math.floor(maxValue) : Math.ceil(maxValue);
			if (this.skipCheck === false && maxValue - minValue + 1 < count) {
				throw new Error(
					'count exceeds max number of unique integers in given range(min, max), try to make range wider.',
				);
			}
		} else {
			throw new Error(
				'minValue and maxValue should be the same type.',
			);
		}

		this.state = { rng, minValue, maxValue, intervals, integersCount };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let intervalIdx: number,
			numb: number | bigint | undefined;

		const intervalsToAdd: (number | bigint)[][] = [];

		if (this.state.intervals.length === 0) {
			if (this.skipCheck === false) {
				throw new RangeError(
					'generateUniqueInt: count exceeds max number of unique integers in given range(min, max), try to increase range.',
				);
			} else {
				return;
			}
		}

		[intervalIdx, this.state.rng] = prand.uniformIntDistribution(
			0,
			this.state.intervals.length - 1,
			this.state.rng,
		);

		const interval = this.state.intervals[intervalIdx] as (number | bigint)[];
		const [currMinNumb, currMaxNumb] = [interval[0] as number | bigint, interval[1] as number | bigint];

		if (typeof currMinNumb === 'number' && typeof currMaxNumb === 'number') {
			numb = this.generateNumber(currMinNumb, currMaxNumb, intervalsToAdd as number[][], intervalIdx);
		} else if (typeof currMinNumb === 'bigint' && typeof currMaxNumb === 'bigint') {
			numb = this.generateBigint(
				currMinNumb as bigint,
				currMaxNumb as bigint,
				intervalsToAdd as bigint[][],
				intervalIdx,
			);
		}

		if (this.dataType === 'string') {
			return String(numb);
		}

		if (this.dataType === 'bigint' && numb !== undefined) {
			numb = BigInt(numb);
		}
		return numb;
	}

	generateNumber(currMinNumb: number, currMaxNumb: number, intervalsToAdd: number[][], intervalIdx: number) {
		let numb: number;

		[numb, this.state!.rng] = prand.uniformIntDistribution(currMinNumb, currMaxNumb, this.state!.rng);

		if (this.genMaxRepeatedValuesCount !== undefined) {
			if (this.state!.integersCount.get(numb) === undefined) {
				this.state!.integersCount.set(numb, this.genMaxRepeatedValuesCount.generate() as number);
			}
			this.state!.integersCount.set(numb, this.state!.integersCount.get(numb)! - 1);
		}

		if (this.state!.integersCount.get(numb) === undefined || this.state!.integersCount.get(numb) === 0) {
			if (numb === currMinNumb) {
				intervalsToAdd = numb + 1 <= currMaxNumb ? [[numb + 1, currMaxNumb]] : [];
			} else if (numb === currMaxNumb) {
				intervalsToAdd = [[currMinNumb, numb - 1]];
			} else {
				intervalsToAdd = [
					[currMinNumb, numb - 1],
					[numb + 1, currMaxNumb],
				];
			}

			const t0 = new Date();
			this.state!.intervals[intervalIdx] = this.state!.intervals[this.state!.intervals.length - 1]!;
			this.state?.intervals.pop();
			this.timeSpent += (Date.now() - t0.getTime()) / 1000;
			this.state!.intervals.push(...intervalsToAdd);
		}

		return numb;
	}

	generateBigint(currMinNumb: bigint, currMaxNumb: bigint, intervalsToAdd: bigint[][], intervalIdx: number) {
		let numb: bigint;
		[numb, this.state!.rng] = prand.uniformBigIntDistribution(currMinNumb, currMaxNumb, this.state!.rng);
		if (this.genMaxRepeatedValuesCount !== undefined) {
			if (this.state!.integersCount.get(numb) === undefined) {
				this.state!.integersCount.set(numb, this.genMaxRepeatedValuesCount.generate() as number);
			}
			this.state!.integersCount.set(numb, this.state!.integersCount.get(numb)! - 1);
		}

		if (this.state!.integersCount.get(numb) === undefined || this.state!.integersCount.get(numb) === 0) {
			if (numb === currMinNumb) {
				intervalsToAdd = numb + BigInt(1) <= currMaxNumb ? [[numb + BigInt(1), currMaxNumb]] : [];
			} else if (numb === currMaxNumb) {
				intervalsToAdd = [[currMinNumb, numb - BigInt(1)]];
			} else {
				intervalsToAdd = [
					[currMinNumb, numb - BigInt(1)],
					[numb + BigInt(1), currMaxNumb],
				];
			}

			this.state!.intervals[intervalIdx] = this.state!.intervals[this.state!.intervals.length - 1]!;
			this.state?.intervals.pop();
			this.state!.intervals.push(...intervalsToAdd);
		}

		return numb;
	}
}

export class GenerateBoolean extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateBoolean';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let value: number;

		[value, this.state.rng] = prand.uniformIntDistribution(0, 1, this.state.rng);
		return value === 1;
	}
}

export class GenerateDate extends AbstractGenerator<{ minDate?: string | Date; maxDate?: string | Date }> {
	static override readonly [entityKind]: string = 'GenerateDate';

	private state: {
		rng: prand.RandomGenerator;
		minDate: Date;
		maxDate: Date;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		let { minDate, maxDate } = this.params;
		const anchorDate = new Date('2024-05-08');
		const deltaMilliseconds = 4 * 31536000000;

		if (typeof minDate === 'string') {
			minDate = new Date(minDate);
		}

		if (typeof maxDate === 'string') {
			maxDate = new Date(maxDate);
		}

		if (minDate === undefined) {
			if (maxDate === undefined) {
				minDate = new Date(anchorDate.getTime() - deltaMilliseconds);
				maxDate = new Date(anchorDate.getTime() + deltaMilliseconds);
			} else {
				minDate = new Date(maxDate.getTime() - (2 * deltaMilliseconds));
			}
		}

		if (maxDate === undefined) {
			maxDate = new Date(minDate.getTime() + (2 * deltaMilliseconds));
		}

		this.state = { rng, minDate, maxDate };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let milliseconds: number;

		[milliseconds, this.state.rng] = prand.uniformIntDistribution(
			this.state.minDate.getTime(),
			this.state.maxDate.getTime(),
			this.state.rng,
		);
		const date = new Date(milliseconds);

		if (this.dataType === 'string') {
			return date.toISOString().replace(/T.+/, '');
		}
		return date;
	}
}
export class GenerateTime extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateTime';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const anchorDateTime = new Date('2024-05-08T12:00:00.000Z');
		const oneDayInMilliseconds = 86400000;

		let date = new Date();
		let milliseconds: number;

		[milliseconds, this.state.rng] = prand.uniformIntDistribution(
			-oneDayInMilliseconds,
			oneDayInMilliseconds,
			this.state.rng,
		);
		date = new Date(date.setTime(anchorDateTime.getTime() + milliseconds));

		return date.toISOString().replace(/(\d{4}-\d{2}-\d{2}T)|(\.\d{3}Z)/g, '');
	}
}
export class GenerateTimestampInt extends AbstractGenerator<{ unitOfTime?: 'seconds' | 'milliseconds' }> {
	static override readonly [entityKind]: string = 'GenerateTimestampInt';

	private state: {
		generateTimestampObj: GenerateTimestamp;
	} | undefined;

	init({ seed }: { seed: number }) {
		const generateTimestampObj = new GenerateTimestamp({});
		generateTimestampObj.dataType = 'date';
		generateTimestampObj.init({ seed });

		this.state = { generateTimestampObj };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const date = this.state.generateTimestampObj.generate() as Date;

		if (this.params.unitOfTime === 'seconds') {
			return Math.floor(date.getTime() / 1000);
		} else if (this.params.unitOfTime === 'milliseconds') {
			return date.getTime();
		} else {
			// this.params.unitOfTime === undefined
			return Math.floor(date.getTime() / 1000);
		}
	}
}

export class GenerateTimestamp extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateTimestamp';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const anchorTimestamp = new Date('2024-05-08');
		const twoYearsInMilliseconds = 2 * 31536000000;

		let date = new Date();
		let milliseconds: number;

		[milliseconds, this.state.rng] = prand.uniformIntDistribution(
			-twoYearsInMilliseconds,
			twoYearsInMilliseconds,
			this.state.rng,
		);
		date = new Date(date.setTime(anchorTimestamp.getTime() + milliseconds));

		if (this.dataType === 'string') {
			return date
				.toISOString()
				.replace('T', ' ')
				.replace(/\.\d{3}Z/, '');
		}

		return date;
	}
}

export class GenerateDatetime extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateDatetime';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const anchorDate = new Date('2024-05-08');
		const twoYearsInMilliseconds = 2 * 31536000000;

		let date = new Date();
		let milliseconds: number;

		[milliseconds, this.state.rng] = prand.uniformIntDistribution(
			-twoYearsInMilliseconds,
			twoYearsInMilliseconds,
			this.state.rng,
		);
		date = new Date(date.setTime(anchorDate.getTime() + milliseconds));

		if (this.dataType === 'string') {
			return date
				.toISOString()
				.replace('T', ' ')
				.replace(/\.\d{3}Z/, '');
		}

		return date;
	}
}

export class GenerateYear extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateYear';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const anchorDate = new Date('2024-05-08');
		const tenYears = 10;

		let date = new Date();
		let years: number;

		[years, this.state.rng] = prand.uniformIntDistribution(-tenYears, tenYears, this.state.rng);
		date = new Date(date.setFullYear(anchorDate.getFullYear() + years));

		return date
			.toISOString()
			.replace(/(-\d{2}-\d{2}T)|(\d{2}:\d{2}:\d{2}\.\d{3}Z)/g, '');
	}
}

export class GenerateJson extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateJson';

	private state: {
		emailGeneratorObj: GenerateEmail;
		nameGeneratorObj: GenerateFirstName;
		booleanGeneratorObj: GenerateBoolean;
		salaryGeneratorObj: GenerateInt;
		dateGeneratorObj: GenerateDate;
		visitedCountriesNumberGeneratorObj: GenerateInt;
		seed: number;
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const emailGeneratorObj = new GenerateEmail({});
		emailGeneratorObj.init({ count, seed });

		const nameGeneratorObj = new GenerateFirstName({});
		nameGeneratorObj.init({ seed });

		const booleanGeneratorObj = new GenerateBoolean({});
		booleanGeneratorObj.init({
			seed,
		});

		const salaryGeneratorObj = new GenerateInt({ minValue: 200, maxValue: 4000 });
		salaryGeneratorObj.init({
			count,
			seed,
			...salaryGeneratorObj.params,
		});

		const dateGeneratorObj = new GenerateDate({});
		dateGeneratorObj.dataType = 'string';
		dateGeneratorObj.init({ seed });

		const visitedCountriesNumberGeneratorObj = new GenerateInt({ minValue: 0, maxValue: 4 });
		visitedCountriesNumberGeneratorObj.init(
			{ count, seed, ...visitedCountriesNumberGeneratorObj.params },
		);

		this.state = {
			emailGeneratorObj,
			nameGeneratorObj,
			booleanGeneratorObj,
			salaryGeneratorObj,
			dateGeneratorObj,
			visitedCountriesNumberGeneratorObj,
			seed,
		};
	}

	generate({ i }: { i: number }) {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const visitedCountries: string[] = [];
		const email = this.state.emailGeneratorObj.generate();
		const name = this.state.nameGeneratorObj.generate();
		const isGraduated = this.state.booleanGeneratorObj.generate();
		const hasJob = this.state.booleanGeneratorObj.generate();
		const salary = this.state.salaryGeneratorObj.generate() as number;
		const startedWorking = this.state.dateGeneratorObj.generate() as string;
		const visitedCountriesNumber = this.state.visitedCountriesNumberGeneratorObj.generate() as number;

		const uniqueCountriesGeneratorObj = new GenerateUniqueCountry({});
		uniqueCountriesGeneratorObj.init({
			count: visitedCountriesNumber,
			seed: this.state.seed + i,
		});
		for (let j = 0; j < visitedCountriesNumber; j++) {
			visitedCountries.push(uniqueCountriesGeneratorObj.generate());
		}

		const returnJson = hasJob
			? {
				email,
				name,
				isGraduated,
				hasJob,
				salary,
				startedWorking,
				visitedCountries,
			}
			: {
				email,
				name,
				isGraduated,
				hasJob,
				visitedCountries,
			};

		if (this.dataType === 'string') {
			return JSON.stringify(returnJson);
		}

		return returnJson;
	}
}

export class GenerateEnum extends AbstractGenerator<{ enumValues: (string | number | boolean)[] }> {
	static override readonly [entityKind]: string = 'GenerateEnum';

	private state: {
		enumValuesGenerator: GenerateValuesFromArray;
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const { enumValues } = this.params;
		const enumValuesGenerator = new GenerateValuesFromArray({ values: enumValues });
		enumValuesGenerator.init({ count, seed });
		this.state = { enumValuesGenerator };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}
		// logic for this generator
		return this.state.enumValuesGenerator.generate();
	}
}

export class GenerateInterval extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateInterval';

	private state: { rng: prand.RandomGenerator } | undefined;
	override uniqueVersionOfGen = GenerateUniqueInterval;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng };
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

		return interval;
	}
}

export class GenerateUniqueInterval extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueInterval';

	private state: {
		rng: prand.RandomGenerator;
		intervalSet: Set<string>;
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
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

export class GenerateString extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateString';

	private state: { rng: prand.RandomGenerator } | undefined;
	override uniqueVersionOfGen = GenerateUniqueString;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

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

export class GenerateUniqueString extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueString';

	private state: { rng: prand.RandomGenerator } | undefined;
	public override isUnique = true;

	init({ seed }: { seed: number }) {
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

export class GenerateFirstName extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateFirstName';

	override timeSpent: number = 0;
	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueFirstName;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		// logic for this generator
		// names dataset contains about 30000 unique names.
		// TODO: generate names accordingly to max column length
		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, firstNames.length - 1, this.state.rng);
		return firstNames[idx] as string;
	}
}

export class GenerateUniqueFirstName extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniqueFirstName';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		if (count > firstNames.length) {
			throw new Error('count exceeds max number of unique first names.');
		}
		const genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: firstNames.length - 1 });
		genIndicesObj.init({ count, seed });

		this.state = { genIndicesObj };
	}

	generate() {
		// names dataset contains about 30000 unique names.
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const nameIdx = this.state.genIndicesObj.generate() as number;
		const name = firstNames[nameIdx] as string;

		return name;
	}
}

export class GenerateLastName extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateLastName';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueLastName;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}
	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, lastNames.length - 1, this.state.rng);
		return lastNames[idx];
	}
}

export class GenerateUniqueLastName extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueLastName';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		if (count > lastNames.length) {
			throw new Error('count exceeds max number of unique last names.');
		}

		const genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: lastNames.length - 1 });
		genIndicesObj.init({ count, seed });

		this.state = { genIndicesObj };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const surnameIdx = this.state.genIndicesObj.generate() as number;
		const surname = lastNames[surnameIdx] as string;

		return surname;
	}
}

export class GenerateFullName extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateFullName';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueFullName;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, firstNames.length - 1, this.state.rng);
		const name = firstNames[idx] as string;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, lastNames.length - 1, this.state.rng);
		const surname = lastNames[idx] as string;

		const fullName = `${name} ${surname}`;

		return fullName;
	}
}

export class GenerateUniqueFullName extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniqueFullName';

	private state: {
		fullnameSet: Set<string>;
		rng: prand.RandomGenerator;
	} | undefined;
	public override isUnique = true;
	public override timeSpent = 0;

	init({ count, seed }: { count: number; seed: number }) {
		const t0 = new Date();

		const maxUniqueFullNamesNumber = firstNames.length * lastNames.length;
		if (count > maxUniqueFullNamesNumber) {
			throw new RangeError(
				`count exceeds max number of unique full names(${maxUniqueFullNamesNumber}).`,
			);
		}
		const rng = prand.xoroshiro128plus(seed);
		const fullnameSet = new Set<string>();

		this.state = { rng, fullnameSet };
		this.timeSpent += (Date.now() - t0.getTime()) / 1000;
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let fullname: string, name: string, surname: string, idx: number;

		const t0 = new Date();
		for (;;) {
			[idx, this.state.rng] = prand.uniformIntDistribution(0, firstNames.length - 1, this.state.rng);
			name = firstNames[idx] as string;

			[idx, this.state.rng] = prand.uniformIntDistribution(0, lastNames.length - 1, this.state.rng);
			surname = lastNames[idx] as string;

			fullname = `${name} ${surname}`;

			if (!this.state.fullnameSet.has(fullname)) {
				this.state.fullnameSet.add(fullname);
				break;
			}
		}

		this.timeSpent += (Date.now() - t0.getTime()) / 1000;
		return fullname;
	}
}

export class GenerateEmail extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateEmail';

	private state: {
		genIndicesObj: GenerateUniqueInt;
		arraysToGenerateFrom: string[][];
	} | undefined;
	public override timeSpent: number = 0;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		const domainsArray = emailDomains;
		const adjectivesArray = adjectives;
		const namesArray = firstNames;

		const maxUniqueEmailsNumber = adjectivesArray.length * namesArray.length * domainsArray.length;
		if (count > maxUniqueEmailsNumber) {
			throw new RangeError(
				`count exceeds max number of unique emails(${maxUniqueEmailsNumber}).`,
			);
		}

		const arraysToGenerateFrom = [adjectivesArray, namesArray, domainsArray];
		const genIndicesObj = new GenerateUniqueInt({
			minValue: 0,
			maxValue: maxUniqueEmailsNumber - 1,
		});
		genIndicesObj.init({ count, seed });

		this.state = { genIndicesObj, arraysToGenerateFrom };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const t0 = new Date();
		const emailIndex = this.state.genIndicesObj.generate() as number;
		this.timeSpent += (Date.now() - t0.getTime()) / 1000;
		const tokens = fastCartesianProduct(
			this.state.arraysToGenerateFrom,
			emailIndex,
		) as string[];

		const [adjective, name, domain] = [tokens[0] as string, tokens[1] as string, tokens[2] as string];

		const email = `${adjective}_${name.toLowerCase()}@${domain}`;

		return email;
	}
}

export class GeneratePhoneNumber extends AbstractGenerator<{
	template?: string;
	prefixes?: string[];
	generatedDigitsNumbers?: number | number[];
}> {
	static override readonly [entityKind]: string = 'GeneratePhoneNumber';

	private state: {
		rng: prand.RandomGenerator;
		placeholdersCount?: number;
		prefixesArray: string[];
		generatedDigitsNumbers: number[];
		generatorsMap: Map<string, GenerateUniqueInt>;
		phoneNumbersSet: Set<string>;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		let { generatedDigitsNumbers } = this.params;
		const { prefixes, template } = this.params;

		const rng = prand.xoroshiro128plus(seed);

		if (template !== undefined) {
			const iterArray = [...template.matchAll(/#/g)];
			const placeholdersCount = iterArray.length;

			const maxUniquePhoneNumbersCount = Math.pow(10, placeholdersCount);
			if (maxUniquePhoneNumbersCount < count) {
				throw new RangeError(
					`count exceeds max number of unique phone numbers(${maxUniquePhoneNumbersCount}).`,
				);
			}

			const generatorsMap = new Map<string, GenerateUniqueInt>();
			const genObj = new GenerateUniqueInt({ minValue: 0, maxValue: maxUniquePhoneNumbersCount - 1 });
			genObj.init({
				count,
				seed,
			});

			generatorsMap.set(
				template,
				genObj,
			);

			const prefixesArray: string[] = [];
			const generatedDigitsNumbers: number[] = [];
			const phoneNumbersSet = new Set<string>();

			this.state = { rng, placeholdersCount, generatorsMap, prefixesArray, generatedDigitsNumbers, phoneNumbersSet };
			return;
		}

		let prefixesArray: string[];
		if (prefixes === undefined || prefixes.length === 0) {
			prefixesArray = phonesInfo.map((phoneInfo) => phoneInfo.split(',').slice(0, -1).join(' '));
			generatedDigitsNumbers = phonesInfo.map((phoneInfo) => {
				// tokens = ["380","99","9"] =
				// = ["country prefix", "operator prefix", "number length including operator prefix and excluding country prefix"]
				const tokens = phoneInfo.split(',');
				const operatorPrefixLength = tokens[1]!.replaceAll(' ', '').length;

				return Number(tokens[2]) - operatorPrefixLength;
			});
		} else {
			prefixesArray = prefixes;
			if (typeof generatedDigitsNumbers === 'number') {
				generatedDigitsNumbers = Array.from<number>({ length: prefixes.length }).fill(
					generatedDigitsNumbers,
				);
			} else if (
				generatedDigitsNumbers === undefined
				|| generatedDigitsNumbers.length === 0
			) {
				generatedDigitsNumbers = Array.from<number>({ length: prefixes.length }).fill(7);
			}
		}

		if (new Set(prefixesArray).size !== prefixesArray.length) {
			throw new Error('prefixes are not unique.');
		}

		const maxUniquePhoneNumbersCount = generatedDigitsNumbers.reduce(
			(a, b) => a + Math.pow(10, b),
			0,
		);
		if (maxUniquePhoneNumbersCount < count) {
			throw new RangeError(
				`count exceeds max number of unique phone numbers(${maxUniquePhoneNumbersCount}).`,
			);
		}

		const generatorsMap = new Map<string, GenerateUniqueInt>();
		let maxValue: number, prefix: string, generatedDigitsNumber: number;
		for (const [i, element] of prefixesArray.entries()) {
			prefix = element as string;
			generatedDigitsNumber = generatedDigitsNumbers[i] as number;
			maxValue = Math.pow(10, generatedDigitsNumber) - 1;

			if (!generatorsMap.has(prefix)) {
				const genObj = new GenerateUniqueInt({ minValue: 0, maxValue });
				genObj.init({
					count: Math.min(count, maxValue + 1),
					seed,
				});
				genObj.skipCheck = true;
				generatorsMap.set(
					prefix,
					genObj,
				);
			}
		}
		const phoneNumbersSet = new Set<string>();

		this.state = { rng, prefixesArray, generatedDigitsNumbers, generatorsMap, phoneNumbersSet };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let prefix: string, generatedDigitsNumber: number, numberBody: string, phoneNumber: string, idx: number;

		if (this.params.template === undefined) {
			for (;;) {
				[idx, this.state.rng] = prand.uniformIntDistribution(
					0,
					this.state.prefixesArray.length - 1,
					this.state.rng,
				);
				prefix = this.state.prefixesArray[idx] as string;
				generatedDigitsNumber = this.state.generatedDigitsNumbers[idx] as number;

				numberBody = String(this.state.generatorsMap.get(prefix)?.generate());
				if (numberBody === 'undefined') {
					this.state.prefixesArray!.splice(idx, 1);
					this.state.generatedDigitsNumbers.splice(idx, 1);

					this.state.generatorsMap.delete(prefix);

					continue;
				}

				if (this.state.phoneNumbersSet.has(numberBody)) {
					continue;
				}
				this.state.phoneNumbersSet.add(numberBody);

				break;
			}

			const digitsNumberDiff = generatedDigitsNumber - numberBody.length;
			if (digitsNumberDiff > 0) {
				numberBody = '0'.repeat(digitsNumberDiff) + numberBody;
			}

			phoneNumber = (prefix.includes('+') ? '' : '+') + prefix + '' + numberBody;

			return phoneNumber;
		} else {
			numberBody = String(this.state.generatorsMap.get(this.params.template)?.generate());
			phoneNumber = fillTemplate({
				template: this.params.template,
				values: [...numberBody],
				defaultValue: '0',
				placeholdersCount: this.state.placeholdersCount,
			});

			return phoneNumber;
		}
	}
}

export class GenerateCountry extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateCountry';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCountry;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, countries.length - 1, this.state.rng);
		const country = countries[idx] as string;

		return country;
	}
}

export class GenerateUniqueCountry extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueCountry';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		if (count > countries.length) {
			throw new Error('count exceeds max number of unique countries.');
		}

		const genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: countries.length - 1 });
		genIndicesObj.init({ count, seed });

		this.state = { genIndicesObj };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const countryIdx = this.state.genIndicesObj.generate() as number;
		const country = countries[countryIdx] as string;

		return country;
	}
}

export class GenerateJobTitle extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateJobTitle';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}
		let idx;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, jobsTitles.length - 1, this.state.rng);

		return jobsTitles[idx];
	}
}

export class GenerateStreetAdddress extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateStreetAdddress';

	private state: {
		rng: prand.RandomGenerator;
		possStreetNames: string[][];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueStreetAdddress;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);
		const possStreetNames = [firstNames, lastNames];
		this.state = { rng, possStreetNames };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx, streetBaseNameIdx, streetSuffixIdx, streetNumber;
		[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.possStreetNames.length - 1, this.state.rng);

		[streetBaseNameIdx, this.state.rng] = prand.uniformIntDistribution(
			0,
			this.state.possStreetNames[idx]!.length - 1,
			this.state.rng,
		);
		[streetSuffixIdx, this.state.rng] = prand.uniformIntDistribution(0, streetSuffix.length - 1, this.state.rng);
		const streetName = `${this.state.possStreetNames[idx]![streetBaseNameIdx]} ${streetSuffix[streetSuffixIdx]}`;

		[streetNumber, this.state.rng] = prand.uniformIntDistribution(1, 999, this.state.rng);

		return `${streetNumber} ${streetName}`;
	}
}

export class GenerateUniqueStreetAdddress extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueStreetAdddress';

	private state: {
		rng: prand.RandomGenerator;
		possStreetNameObjs: {
			indicesGen: GenerateUniqueInt;
			maxUniqueStreetNamesNumber: number;
			count: number;
			arraysToChooseFrom: string[][];
		}[];
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const streetNumberStrs = Array.from({ length: 999 }, (_, i) => String(i + 1));
		const maxUniqueStreetnamesNumber = streetNumberStrs.length * firstNames.length * streetSuffix.length
			+ streetNumberStrs.length * firstNames.length * streetSuffix.length;

		if (count > maxUniqueStreetnamesNumber) {
			throw new RangeError(
				`count exceeds max number of unique street names(${maxUniqueStreetnamesNumber}).`,
			);
		}

		const rng = prand.xoroshiro128plus(seed);
		// ["1", "2", ..., "999"]

		const possStreetNameObjs = [
			{
				indicesGen: new GenerateUniqueInt({
					minValue: 0,
					maxValue: streetNumberStrs.length * firstNames.length * streetSuffix.length - 1,
				}),
				maxUniqueStreetNamesNumber: streetNumberStrs.length * firstNames.length * streetSuffix.length,
				count: 0,
				arraysToChooseFrom: [streetNumberStrs, firstNames, streetSuffix],
			},
			{
				indicesGen: new GenerateUniqueInt({
					minValue: 0,
					maxValue: streetNumberStrs.length * lastNames.length * streetSuffix.length - 1,
				}),
				maxUniqueStreetNamesNumber: streetNumberStrs.length * firstNames.length * streetSuffix.length,
				count: 0,
				arraysToChooseFrom: [streetNumberStrs, lastNames, streetSuffix],
			},
		];

		for (const possStreetNameObj of possStreetNameObjs) {
			possStreetNameObj.indicesGen.skipCheck = true;
			possStreetNameObj.indicesGen.init({ count, seed });
		}

		this.state = { rng, possStreetNameObjs };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let streetNameObjIdx;
		[streetNameObjIdx, this.state.rng] = prand.uniformIntDistribution(
			0,
			this.state.possStreetNameObjs.length - 1,
			this.state.rng,
		);
		const streetNameObj = this.state.possStreetNameObjs[streetNameObjIdx]!;

		const idx = streetNameObj.indicesGen.generate() as number;
		const values = fastCartesianProduct(streetNameObj.arraysToChooseFrom, idx) as string[];

		streetNameObj.count += 1;
		if (streetNameObj.count === streetNameObj.maxUniqueStreetNamesNumber) {
			this.state.possStreetNameObjs[streetNameObjIdx] = this.state
				.possStreetNameObjs.at(-1)!;
			this.state.possStreetNameObjs.pop();
		}

		const streetName = fillTemplate({ template: '# # #', values, placeholdersCount: 3 });

		return streetName;
	}
}

export class GenerateCity extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateCity';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCity;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx;
		[idx, this.state.rng] = prand.uniformIntDistribution(0, cityNames.length - 1, this.state.rng);

		return cityNames[idx];
	}
}

export class GenerateUniqueCity extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueCity';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	init({ count, seed }: { count: number; seed: number }) {
		if (count > cityNames.length) {
			throw new Error('count exceeds max number of unique cities.');
		}

		const genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: cityNames.length - 1 });
		genIndicesObj.init({ count, seed });

		this.state = { genIndicesObj };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const cityIdx = this.state.genIndicesObj.generate() as number;
		const city = cityNames[cityIdx] as string;

		return city;
	}
}

export class GeneratePostcode extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GeneratePostcode';

	private state: {
		rng: prand.RandomGenerator;
		templates: string[];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniquePostcode;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);
		const templates = ['#####', '#####-####'];

		this.state = { rng, templates };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number, postcodeNumber: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.templates.length - 1, this.state.rng);
		const template = this.state.templates[idx]!;

		const iterArray = [...template.matchAll(/#/g)];
		const placeholdersCount = iterArray.length;

		[postcodeNumber, this.state.rng] = prand.uniformIntDistribution(
			0,
			Math.pow(10, placeholdersCount) - 1,
			this.state.rng,
		);
		const postcode = fillTemplate({
			template,
			placeholdersCount,
			values: [...String(postcodeNumber)],
			defaultValue: '0',
		});

		return postcode;
	}
}

export class GenerateUniquePostcode extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniquePostcode';

	private state: {
		rng: prand.RandomGenerator;
		templates: {
			template: string;
			indicesGen: GenerateUniqueInt;
			placeholdersCount: number;
			count: number;
			maxUniquePostcodeNumber: number;
		}[];
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const maxUniquePostcodeNumber = Math.pow(10, 5) + Math.pow(10, 9);
		if (count > maxUniquePostcodeNumber) {
			throw new RangeError(
				`count exceeds max number of unique postcodes(${maxUniquePostcodeNumber}).`,
			);
		}

		const rng = prand.xoroshiro128plus(seed);
		const templates = [
			{
				template: '#####',
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: Math.pow(10, 5) - 1 }),
				placeholdersCount: 5,
				count: 0,
				maxUniquePostcodeNumber: Math.pow(10, 5),
			},
			{
				template: '#####-####',
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: Math.pow(10, 9) - 1 }),
				placeholdersCount: 9,
				count: 0,
				maxUniquePostcodeNumber: Math.pow(10, 9),
			},
		];

		for (const templateObj of templates) {
			templateObj.indicesGen.skipCheck = true;
			templateObj.indicesGen.init({ count, seed });
		}

		this.state = { rng, templates };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.templates.length - 1, this.state.rng);
		const templateObj = this.state.templates[idx]!;

		const postcodeNumber = templateObj.indicesGen.generate() as number;

		templateObj.count += 1;
		if (templateObj.count === templateObj.maxUniquePostcodeNumber) {
			this.state.templates[idx] = this.state.templates.at(-1)!;
			this.state.templates.pop();
		}

		const postcode = fillTemplate({
			template: templateObj.template,
			placeholdersCount: templateObj.placeholdersCount,
			values: [...String(postcodeNumber)],
			defaultValue: '0',
		});

		return postcode;
	}
}

export class GenerateState extends AbstractGenerator<{}> {
	static override readonly [entityKind]: string = 'GenerateState';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx;
		[idx, this.state.rng] = prand.uniformIntDistribution(0, states.length - 1, this.state.rng);

		return states[idx];
	}
}

export class GenerateCompanyName extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateCompanyName';

	private state: {
		rng: prand.RandomGenerator;
		templates: { template: string; placeholdersCount: number }[];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCompanyName;

	init({ seed }: { seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const rng = prand.xoroshiro128plus(seed);
		const templates = [
			{ template: '#', placeholdersCount: 1 },
			{ template: '# - #', placeholdersCount: 2 },
			{ template: '# and #', placeholdersCount: 2 },
			{ template: '#, # and #', placeholdersCount: 3 },
		];

		this.state = { rng, templates };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let templateIdx, idx, lastName, companyNameSuffix, companyName;
		[templateIdx, this.state.rng] = prand.uniformIntDistribution(0, this.state.templates.length - 1, this.state.rng);
		const templateObj = this.state.templates[templateIdx]!;

		if (templateObj.template === '#') {
			[idx, this.state.rng] = prand.uniformIntDistribution(0, lastNames.length - 1, this.state.rng);
			lastName = lastNames[idx];

			[idx, this.state.rng] = prand.uniformIntDistribution(0, companyNameSuffixes.length - 1, this.state.rng);
			companyNameSuffix = companyNameSuffixes[idx];

			companyName = `${lastName} ${companyNameSuffix}`;
			return companyName;
		}

		const values = [];
		for (let i = 0; i < templateObj.placeholdersCount; i++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(0, lastNames.length - 1, this.state.rng);
			values.push(lastNames[idx]!);
		}

		companyName = fillTemplate({
			template: templateObj.template,
			values,
			placeholdersCount: templateObj.placeholdersCount,
		});
		return companyName;
	}
}

export class GenerateUniqueCompanyName extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly [entityKind]: string = 'GenerateUniqueCompanyName';

	private state: {
		rng: prand.RandomGenerator;
		templates: {
			template: string;
			placeholdersCount: number;
			indicesGen: GenerateUniqueInt;
			maxUniqueCompanyNameNumber: number;
			count: number;
			arraysToChooseFrom: string[][];
		}[];
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const maxUniqueCompanyNameNumber = lastNames.length * companyNameSuffixes.length + Math.pow(lastNames.length, 2)
			+ Math.pow(lastNames.length, 2) + Math.pow(lastNames.length, 3);
		if (count > maxUniqueCompanyNameNumber) {
			throw new RangeError(
				`count exceeds max number of unique company names(${maxUniqueCompanyNameNumber}).`,
			);
		}

		const rng = prand.xoroshiro128plus(seed);
		// when count reach maxUniqueCompanyNameNumber template will be deleted from array
		const templates = [
			{
				template: '# - #',
				placeholdersCount: 1,
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: lastNames.length * companyNameSuffixes.length - 1 }),
				maxUniqueCompanyNameNumber: lastNames.length * companyNameSuffixes.length,
				count: 0,
				arraysToChooseFrom: [lastNames, companyNameSuffixes],
			},
			{
				template: '# - #',
				placeholdersCount: 2,
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: Math.pow(lastNames.length, 2) - 1 }),
				maxUniqueCompanyNameNumber: Math.pow(lastNames.length, 2),
				count: 0,
				arraysToChooseFrom: [lastNames, lastNames],
			},
			{
				template: '# and #',
				placeholdersCount: 2,
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: Math.pow(lastNames.length, 2) - 1 }),
				maxUniqueCompanyNameNumber: Math.pow(lastNames.length, 2),
				count: 0,
				arraysToChooseFrom: [lastNames, lastNames],
			},
			{
				template: '#, # and #',
				placeholdersCount: 3,
				indicesGen: new GenerateUniqueInt({ minValue: 0, maxValue: Math.pow(lastNames.length, 3) - 1 }),
				maxUniqueCompanyNameNumber: Math.pow(lastNames.length, 3),
				count: 0,
				arraysToChooseFrom: [lastNames, lastNames, lastNames],
			},
		];

		for (const templateObj of templates) {
			templateObj.indicesGen.skipCheck = true;
			templateObj.indicesGen.init({ count, seed });
		}

		this.state = { rng, templates };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let templateIdx;
		[templateIdx, this.state.rng] = prand.uniformIntDistribution(0, this.state.templates.length - 1, this.state.rng);
		const templateObj = this.state.templates[templateIdx]!;

		const idx = templateObj.indicesGen.generate() as number;
		const values = fastCartesianProduct(templateObj.arraysToChooseFrom, idx) as string[];

		templateObj.count += 1;
		if (templateObj.count === templateObj.maxUniqueCompanyNameNumber) {
			this.state.templates[templateIdx] = this.state.templates.at(-1)!;
			this.state.templates.pop();
		}

		const companyName = fillTemplate({
			template: templateObj.template,
			values,
			placeholdersCount: templateObj.placeholdersCount,
		});
		return companyName;
	}
}

export class GenerateLoremIpsum extends AbstractGenerator<{ sentencesCount?: number }> {
	static override readonly [entityKind]: string = 'GenerateLoremIpsum';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	init({ seed }: { seed: number }) {
		const rng = prand.xoroshiro128plus(seed);
		if (this.params.sentencesCount === undefined) this.params.sentencesCount = 1;

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx, resultText: string = '';
		for (let i = 0; i < this.params.sentencesCount!; i++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(0, loremIpsumSentences.length - 1, this.state.rng);
			resultText += loremIpsumSentences[idx] + ' ';
		}

		return resultText;
	}
}

export class WeightedRandomGenerator extends AbstractGenerator<{ weight: number; value: AbstractGenerator<any> }[]> {
	static override readonly [entityKind]: string = 'WeightedRandomGenerator';

	private state: {
		rng: prand.RandomGenerator;
		weightedIndices: number[];
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const weights = this.params.map((weightedGen) => weightedGen.weight);
		const weightedIndices = getWeightedIndices(weights);

		let idx: number, valueIdx: number, tempRng = prand.xoroshiro128plus(seed);
		const indicesCounter: { [key: number]: number } = {};
		for (let i = 0; i < count; i++) {
			[idx, tempRng] = prand.uniformIntDistribution(0, weightedIndices.length - 1, tempRng);
			valueIdx = weightedIndices[idx]!;
			if (!Object.hasOwn(indicesCounter, valueIdx)) indicesCounter[valueIdx] = 0;
			indicesCounter[valueIdx]! += 1;
		}

		for (const [idx, weightedGen] of this.params.entries()) {
			weightedGen.value.isUnique = this.isUnique;
			weightedGen.value.dataType = this.dataType;
			weightedGen.value.init({ count: indicesCounter[idx]!, seed });

			if (
				weightedGen.value.uniqueVersionOfGen !== undefined
				&& weightedGen.value.isUnique === true
			) {
				const uniqueGen = new weightedGen.value.uniqueVersionOfGen({
					...weightedGen.value.params,
				});
				uniqueGen.init({
					count: indicesCounter[idx]!,
					seed,
				});
				uniqueGen.isUnique = weightedGen.value.isUnique;
				uniqueGen.dataType = weightedGen.value.dataType;

				weightedGen.value = uniqueGen;
			}
		}

		const rng = prand.xoroshiro128plus(seed);

		this.state = { weightedIndices, rng };
	}

	generate({ i }: { i: number }) {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let idx: number;
		[idx, this.state.rng] = prand.uniformIntDistribution(0, this.state.weightedIndices.length - 1, this.state.rng);
		const generatorIdx = this.state.weightedIndices[idx] as number;
		const value = this.params[generatorIdx]!.value.generate({ i });

		return value;
	}
}

export class GeneratePoint extends AbstractGenerator<{
	isUnique?: boolean;
	minXValue?: number;
	maxXValue?: number;
	minYValue?: number;
	maxYValue?: number;
}> {
	static override readonly [entityKind]: string = 'GeneratePoint';

	private state: {
		xCoordinateGen: GenerateNumber;
		yCoordinateGen: GenerateNumber;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniquePoint;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const xCoordinateGen = new GenerateNumber({
			minValue: this.params.minXValue,
			maxValue: this.params.maxXValue,
			precision: 10,
		});
		xCoordinateGen.init({ seed });

		const yCoordinateGen = new GenerateNumber({
			minValue: this.params.minYValue,
			maxValue: this.params.maxYValue,
			precision: 10,
		});
		yCoordinateGen.init({ seed });

		this.state = { xCoordinateGen, yCoordinateGen };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const x = this.state.xCoordinateGen.generate();
		const y = this.state.yCoordinateGen.generate();

		if (this.dataType === 'json') {
			return { x, y };
		} else if (this.dataType === 'string') {
			return `[${x}, ${y}]`;
		} else {
			// if (this.dataType === "array")
			return [x, y];
		}
	}
}

export class GenerateUniquePoint extends AbstractGenerator<{
	minXValue?: number;
	maxXValue?: number;
	minYValue?: number;
	maxYValue?: number;
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniquePoint';

	private state: {
		xCoordinateGen: GenerateUniqueNumber;
		yCoordinateGen: GenerateUniqueNumber;
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const xCoordinateGen = new GenerateUniqueNumber({
			minValue: this.params.minXValue,
			maxValue: this.params.maxXValue,
			precision: 10,
		});
		xCoordinateGen.init({ count, seed });

		const yCoordinateGen = new GenerateUniqueNumber({
			minValue: this.params.minYValue,
			maxValue: this.params.maxYValue,
			precision: 10,
		});
		yCoordinateGen.init({ count, seed });

		this.state = { xCoordinateGen, yCoordinateGen };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		const x = this.state.xCoordinateGen.generate();
		const y = this.state.yCoordinateGen.generate();

		if (this.dataType === 'json') {
			return { x, y };
		} else if (this.dataType === 'string') {
			return `[${x}, ${y}]`;
		} else {
			// if (this.dataType === "array")
			return [x, y];
		}
	}
}

export class GenerateLine extends AbstractGenerator<{
	isUnique?: boolean;
	minAValue?: number;
	maxAValue?: number;
	minBValue?: number;
	maxBValue?: number;
	minCValue?: number;
	maxCValue?: number;
}> {
	static override readonly [entityKind]: string = 'GenerateLine';

	private state: {
		aCoefficientGen: GenerateNumber;
		bCoefficientGen: GenerateNumber;
		cCoefficientGen: GenerateNumber;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueLine;

	init({ seed }: { count: number; seed: number }) {
		if (this.params.isUnique !== undefined) {
			if (this.params.isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = this.params.isUnique;
		}

		const aCoefficientGen = new GenerateNumber({
			minValue: this.params.minAValue,
			maxValue: this.params.maxAValue,
			precision: 10,
		});
		aCoefficientGen.init({ seed });

		const bCoefficientGen = new GenerateNumber({
			minValue: this.params.minBValue,
			maxValue: this.params.maxBValue,
			precision: 10,
		});
		bCoefficientGen.init({ seed });

		const cCoefficientGen = new GenerateNumber({
			minValue: this.params.minCValue,
			maxValue: this.params.maxCValue,
			precision: 10,
		});
		cCoefficientGen.init({ seed });

		this.state = { aCoefficientGen, bCoefficientGen, cCoefficientGen };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let b: number;
		const a = this.state.aCoefficientGen.generate();

		b = this.state.bCoefficientGen.generate();
		while (a === 0 && b === 0) {
			b = this.state.bCoefficientGen.generate();
		}

		const c = this.state.cCoefficientGen.generate();

		if (this.dataType === 'json') {
			return { a, b, c };
		} else if (this.dataType === 'string') {
			return `[${a}, ${b}, ${c}]`;
		} else {
			// if (this.dataType === "array")
			return [a, b, c];
		}
	}
}

export class GenerateUniqueLine extends AbstractGenerator<{
	minAValue?: number;
	maxAValue?: number;
	minBValue?: number;
	maxBValue?: number;
	minCValue?: number;
	maxCValue?: number;
	isUnique?: boolean;
}> {
	static override readonly [entityKind]: string = 'GenerateUniqueLine';

	private state: {
		aCoefficientGen: GenerateUniqueNumber;
		bCoefficientGen: GenerateUniqueNumber;
		cCoefficientGen: GenerateUniqueNumber;
	} | undefined;

	init({ count, seed }: { count: number; seed: number }) {
		const aCoefficientGen = new GenerateUniqueNumber({
			minValue: this.params.minAValue,
			maxValue: this.params.maxAValue,
			precision: 10,
		});
		aCoefficientGen.init({ count, seed });

		const bCoefficientGen = new GenerateUniqueNumber({
			minValue: this.params.minBValue,
			maxValue: this.params.maxBValue,
			precision: 10,
		});
		bCoefficientGen.init({ count, seed });

		const cCoefficientGen = new GenerateUniqueNumber({
			minValue: this.params.minCValue,
			maxValue: this.params.maxCValue,
			precision: 10,
		});
		cCoefficientGen.init({ count, seed });

		this.state = { aCoefficientGen, bCoefficientGen, cCoefficientGen };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let b: number;
		const a = this.state.aCoefficientGen.generate();

		b = this.state.bCoefficientGen.generate();
		while (a === 0 && b === 0) {
			b = this.state.bCoefficientGen.generate();
		}

		const c = this.state.cCoefficientGen.generate();

		if (this.dataType === 'json') {
			return { a, b, c };
		} else if (this.dataType === 'string') {
			return `[${a}, ${b}, ${c}]`;
		} else {
			// if (this.dataType === "array")
			return [a, b, c];
		}
	}
}

export const generatorsFuncs = {
	/**
	 * generates same given value each time the generator is called.
	 * @param defaultValue - value you want to generate
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *   posts: {
	 *    columns: {
	 *     content: funcs.default({ defaultValue: "post content" }),
	 *    },
	 *   },
	 *  }));
	 * ```
	 */
	default: createGenerator(GenerateDefault),

	/**
	 * generates values from given array
	 * @param values - array of values you want to generate. can be array of weighted values.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    posts: {
	 *      columns: {
	 *        title: funcs.valuesFromArray({
	 *          values: ["Title1", "Title2", "Title3", "Title4", "Title5"],
	 *          isUnique: true
	 *        }),
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 * weighted values example
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    posts: {
	 *      columns: {
	 *        title: funcs.valuesFromArray({
	 *          values: [
	 *            { weight: 0.35, values: ["Title1", "Title2"] },
	 *            { weight: 0.5, values: ["Title3", "Title4"] },
	 *            { weight: 0.15, values: ["Title5"] },
	 *          ],
	 *          isUnique: false
	 *        }),
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	valuesFromArray: createGenerator(GenerateValuesFromArray),

	/**
	 * generates sequential integers starting with 1.
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    posts: {
	 *      columns: {
	 *        id: funcs.intPrimaryKey(),
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	intPrimaryKey: createGenerator(GenerateIntPrimaryKey),

	/**
	 * generates numbers with floating point in given range.
	 * @param minValue - lower border of range.
	 * @param maxValue - upper border of range.
	 * @param precision - precision of generated number:
	 * precision equals 10 means that values will be accurate to one tenth (1.2, 34.6);
	 * precision equals 100 means that values will be accurate to one hundredth (1.23, 34.67).
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    products: {
	 *      columns: {
	 *        unitPrice: funcs.number({ minValue: 10, maxValue: 120, precision: 100, isUnique: false }),
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	number: createGenerator(GenerateNumber),
	// uniqueNumber: createGenerator(GenerateUniqueNumber),

	/**
	 * generates integers within given range.
	 * @param minValue - lower border of range.
	 * @param maxValue - upper border of range.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    products: {
	 *      columns: {
	 *        unitsInStock: funcs.number({ minValue: 0, maxValue: 100, isUnique: false }),
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	int: createGenerator(GenerateInt),
	// uniqueInt: createGenerator(GenerateUniqueInt),

	/**
	 * generates boolean values(true or false)
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        isAvailable: funcs.boolean()
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	boolean: createGenerator(GenerateBoolean),

	/**
	 * generates date within given range.
	 * @param minDate - lower border of range.
	 * @param maxDate - upper border of range.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        birthDate: funcs.date({ minDate: "1990-01-01", maxDate: "2010-12-31" })
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	date: createGenerator(GenerateDate),

	/**
	 * generates time in 24 hours style.
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        birthTime: funcs.time()
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	time: createGenerator(GenerateTime),

	/**
	 * generates timestamps.
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    orders: {
	 *      columns: {
	 *        shippedDate: funcs.timestamp()
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	timestamp: createGenerator(GenerateTimestamp),

	/**
	 * generates datetime objects.
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    orders: {
	 *      columns: {
	 *        shippedDate: funcs.datetime()
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	datetime: createGenerator(GenerateDatetime),

	/**
	 * generates years.
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        birthYear: funcs.year()
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	year: createGenerator(GenerateYear),

	/**
	 * generates json objects with fixed structure.
	 *
	 * json structure can equal this:
	 * ```
	 * {
	 *     email,
	 *     name,
	 *     isGraduated,
	 *     hasJob,
	 *     salary,
	 *     startedWorking,
	 *     visitedCountries,
	 * }
	 * ```
	 * or this
	 * ```
	 * {
	 *     email,
	 *     name,
	 *     isGraduated,
	 *     hasJob,
	 *     visitedCountries,
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        metadata: funcs.json()
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	json: createGenerator(GenerateJson),
	// jsonb: createGenerator(GenerateJsonb),

	/**
	 * generates time intervals.
	 *
	 * interval example: "1 years 12 days 5 minutes"
	 *
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 * @example
	 * ```ts
	 * await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        timeSpentOnWebsite: funcs.interval()
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	interval: createGenerator(GenerateInterval),
	// uniqueInterval: createGenerator(GenerateUniqueInterval),

	/**
	 * generates random strings.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 * await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        hashedPassword: funcs.string({isUnique: false})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	string: createGenerator(GenerateString),
	// uniqueString: createGenerator(GenerateUniqueString),

	/**
	 * generates person's first names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        firstName: funcs.firstName({isUnique: true})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	firstName: createGenerator(GenerateFirstName),
	// uniqueFirstName: createGenerator(GenerateUniqueName),

	/**
	 * generates person's last names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        lastName: funcs.lastName({isUnique: false})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	lastName: createGenerator(GenerateLastName),
	// uniqueLastName: createGenerator(GenerateUniqueSurname),

	/**
	 * generates person's full names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        fullName: funcs.fullName({isUnique: true})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	fullName: createGenerator(GenerateFullName),
	// uniqueFullName: createGenerator(GenerateUniqueFullName),

	/**
	 * generates unique emails.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        email: funcs.email()
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	email: createGenerator(GenerateEmail),

	/**
	 * generates unique phone numbers.
	 *
	 * @param template - phone number template, where all '#' symbols will be substituted with generated digits.
	 * @param prefixes - array of any string you want to be your phone number prefixes.(not compatible with template property)
	 * @param generatedDigitsNumbers - number of digits that will be added at the end of prefixes.(not compatible with template property)
	 * @example
	 * ```ts
	 *  //generate phone number using template property
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        phoneNumber: funcs.phoneNumber({template: "+(380) ###-####"})
	 *      },
	 *    },
	 *  }));
	 *
	 *  //generate phone number using prefixes and generatedDigitsNumbers properties
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        phoneNumber: funcs.phoneNumber({prefixes: [ "+380 99", "+380 67" ], generatedDigitsNumbers: 7})
	 *      },
	 *    },
	 *  }));
	 *
	 *  //generate phone number using prefixes and generatedDigitsNumbers properties but with different generatedDigitsNumbers for prefixes
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        phoneNumber: funcs.phoneNumber({prefixes: [ "+380 99", "+380 67", "+1" ], generatedDigitsNumbers: [7, 7, 10]})
	 *      },
	 *    },
	 *  }));
	 *
	 * ```
	 */
	phoneNumber: createGenerator(GeneratePhoneNumber),

	/**
	 * generates country's names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        country: funcs.country({isUnique: false})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	country: createGenerator(GenerateCountry),
	// uniqueCountry: createGenerator(GenerateUniqueCountry),

	/**
	 * generates city's names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        city: funcs.city({isUnique: false})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	city: createGenerator(GenerateCity),
	// uniqueCity: createGenerator(GenerateUniqueCityName),

	/**
	 * generates street address.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        streetAddress: funcs.streetAddress({isUnique: true})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	streetAddress: createGenerator(GenerateStreetAdddress),
	// uniqueStreetAddress: createGenerator(GenerateUniqueStreetAdddress),

	/**
	 * generates job titles.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        jobTitle: funcs.jobTitle()
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	jobTitle: createGenerator(GenerateJobTitle),

	/**
	 * generates postal codes.
	 *
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        postcode: funcs.postcode({isUnique: true})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	postcode: createGenerator(GeneratePostcode),
	// uniquePostcoe: createGenerator(GenerateUniquePostcode),

	/**
	 * generates states of America.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        state: funcs.state()
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	state: createGenerator(GenerateState),

	/**
	 * generates company's names.
	 *
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        company: funcs.companyName({isUnique: true})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	companyName: createGenerator(GenerateCompanyName),
	// uniqueCompanyName: createGenerator(GenerateUniqueCompanyName),

	/**
	 * generates 'lorem ipsum' text sentences.
	 *
	 * @param sentencesCount - number of sentences you want to generate as one generated value(string).
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    posts: {
	 *      columns: {
	 *        content: funcs.loremIpsum({sentencesCount: 2})
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	loremIpsum: createGenerator(GenerateLoremIpsum),

	/**
	 * generates 2D points within specified ranges for x and y coordinates.
	 *
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 * @param minXValue - lower bound of range for x coordinate.
	 * @param maxXValue - upper bound of range for x coordinate.
	 * @param minYValue - lower bound of range for y coordinate.
	 * @param maxYValue - upper bound of range for y coordinate.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    triangles: {
	 *      columns: {
	 *        pointCoords: funcs.point({
	 *          isUnique: true,
	 *          minXValue: -5, maxXValue:20,
	 *          minYValue: 0, maxYValue: 30
	 *        })
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	point: createGenerator(GeneratePoint),
	// uniquePoint: createGenerator(GenerateUniquePoint),

	/**
	 * generates 2D lines within specified ranges for a, b and c parameters of line.
	 *
	 * ```
	 * line equation: a*x + b*y + c = 0
	 * ```
	 *
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 * @param minAValue - lower bound of range for a parameter.
	 * @param maxAValue - upper bound of range for x parameter.
	 * @param minBValue - lower bound of range for y parameter.
	 * @param maxBValue - upper bound of range for y parameter.
	 * @param minCValue - lower bound of range for y parameter.
	 * @param maxCValue - upper bound of range for y parameter.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    lines: {
	 *      columns: {
	 *        lineParams: funcs.point({
	 *          isUnique: true,
	 *          minAValue: -5, maxAValue:20,
	 *          minBValue: 0, maxBValue: 30,
	 *          minCValue: 0, maxCValue: 10
	 *        })
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	line: createGenerator(GenerateLine),
	// uniqueLine: createGenerator(GenerateUniqueLine),

	/**
	 * gives you the opportunity to call different generators with different probabilities to generate values for one column.
	 * @param params - array of generators with probabilities you would like to call them to generate values.
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    posts: {
	 *      columns: {
	 *        content: funcs.weightedRandom([
	 *          {
	 *            weight: 0.6,
	 *            value: funcs.loremIpsum({ sentencesCount: 3 }),
	 *          },
	 *          {
	 *            weight: 0.4,
	 *            value: funcs.default({ defaultValue: "TODO" }),
	 *          },
	 *        ]),
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	weightedRandom: createGenerator(WeightedRandomGenerator),
};
