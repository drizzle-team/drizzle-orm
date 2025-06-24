/* eslint-disable drizzle-internal/require-entity-kind */
import prand from 'pure-rand';
import adjectives, { maxStringLength as maxAdjectiveLength } from '../datasets/adjectives.ts';
import cityNames, { maxStringLength as maxCityNameLength } from '../datasets/cityNames.ts';
import companyNameSuffixes, { maxStringLength as maxCompanyNameSuffixLength } from '../datasets/companyNameSuffixes.ts';
import countries, { maxStringLength as maxCountryLength } from '../datasets/countries.ts';
import emailDomains, { maxStringLength as maxEmailDomainLength } from '../datasets/emailDomains.ts';
import firstNames, { maxStringLength as maxFirstNameLength } from '../datasets/firstNames.ts';
import jobsTitles, { maxStringLength as maxJobTitleLength } from '../datasets/jobsTitles.ts';
import lastNames, { maxStringLength as maxLastNameLength } from '../datasets/lastNames.ts';
import loremIpsumSentences, { maxStringLength as maxLoremIpsumLength } from '../datasets/loremIpsumSentences.ts';
import phonesInfo from '../datasets/phonesInfo.ts';
import states, { maxStringLength as maxStateLength } from '../datasets/states.ts';
import streetSuffix, { maxStringLength as maxStreetSuffixLength } from '../datasets/streetSuffix.ts';
import { fastCartesianProduct, fillTemplate, getWeightedIndices, isObject } from './utils.ts';

export abstract class AbstractGenerator<T = {}> {
	static readonly entityKind: string = 'AbstractGenerator';
	static readonly version: number = 1;

	public isUnique = false;
	public notNull = false;

	// param for generators which have a unique version of themselves
	public uniqueVersionOfGen?: new(params: T) => AbstractGenerator<T>;

	public dataType?: string;
	public timeSpent?: number;

	//
	public arraySize?: number;
	public baseColumnDataType?: string;

	// param for text-like generators
	public stringLength?: number;

	// params for GenerateValuesFromArray
	public weightedCountSeed?: number | undefined;
	public maxRepeatedValuesCount?: number | { weight: number; count: number | number[] }[] | undefined;

	public params: T;

	constructor(params?: T) {
		this.params = params === undefined ? {} as T : params as T;
	}

	init(params: { count: number | { weight: number; count: number | number[] }[]; seed: number }): void;
	init() {
		this.updateParams();
	}

	updateParams() {
		if ((this.params as any).arraySize !== undefined) {
			this.arraySize = (this.params as any).arraySize;
		}

		if ((this.params as any).isUnique !== undefined) {
			if ((this.params as any).isUnique === false && this.isUnique === true) {
				throw new Error('specifying non unique generator to unique column.');
			}

			this.isUnique = (this.params as any).isUnique;
		}
	}

	abstract generate(params: { i: number }): number | string | boolean | unknown | undefined | void;

	getEntityKind(): string {
		const constructor = this.constructor as typeof AbstractGenerator;
		return constructor.entityKind;
	}

	replaceIfUnique() {
		this.updateParams();
		if (
			this.uniqueVersionOfGen !== undefined
			&& this.isUnique === true
		) {
			const uniqueGen = new this.uniqueVersionOfGen({
				...this.params,
			});

			uniqueGen.isUnique = this.isUnique;
			uniqueGen.dataType = this.dataType;

			return uniqueGen;
		}
		return;
	}

	replaceIfArray() {
		this.updateParams();
		if (!(this.getEntityKind() === 'GenerateArray') && this.arraySize !== undefined) {
			const uniqueGen = this.replaceIfUnique();
			const baseColumnGen = uniqueGen === undefined ? this : uniqueGen;
			baseColumnGen.dataType = this.baseColumnDataType;
			const arrayGen = new GenerateArray(
				{
					baseColumnGen,
					size: this.arraySize,
				},
			);

			return arrayGen;
		}

		return;
	}
}

// Generators Classes -----------------------------------------------------------------------------------------------------------------------
export class GenerateArray extends AbstractGenerator<{ baseColumnGen: AbstractGenerator<any>; size?: number }> {
	static override readonly entityKind: string = 'GenerateArray';
	public override arraySize = 10;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });
		this.arraySize = this.params.size === undefined ? this.arraySize : this.params.size;
		this.params.baseColumnGen.init({ count: count * this.arraySize, seed });
	}

	generate() {
		const array = [];
		for (let i = 0; i < this.arraySize; i++) {
			array.push(this.params.baseColumnGen.generate({ i }));
		}

		return array;
	}
}

export class GenerateWeightedCount extends AbstractGenerator<{}> {
	static override readonly entityKind: string = 'GenerateWeightedCount';

	private state: {
		rng: prand.RandomGenerator;
		weightedIndices: number[];
		weightedCount: { weight: number; count: number | number[] }[];
	} | undefined;

	override init({ seed, count }: { count: { weight: number; count: number | number[] }[]; seed: number }) {
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
	static override readonly entityKind: string = 'HollowGenerator';

	override init() {}

	generate() {}
}

export class GenerateDefault extends AbstractGenerator<{
	defaultValue: unknown;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateDefault';

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
		arraySize?: number;
	}
> {
	static override readonly entityKind: string = 'GenerateValuesFromArray';

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
			throw new Error('Values length equals zero.');
		}

		if (
			isObject(values[0])
			&& !(values as { weight: number; values: any[] }[]).every((val) => val.values.length !== 0)
		) {
			throw new Error('One of weighted values length equals zero.');
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
		if (isObject(values[0])) {
			allValuesCount = (values as { values: any[] }[]).reduce((acc, currVal) => acc + currVal.values.length, 0);
		}

		if (
			notNull === true
			&& maxRepeatedValuesCount !== undefined
			&& (
				(!isObject(values[0]) && typeof maxRepeatedValuesCount === 'number'
					&& maxRepeatedValuesCount * values.length < count)
				|| (isObject(values[0]) && typeof maxRepeatedValuesCount === 'number'
					&& maxRepeatedValuesCount * allValuesCount < count)
			)
		) {
			throw new Error("Can't fill notNull column with null values.");
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
			throw new Error("Can't be greater than 1 if column is unique.");
		}

		if (
			isUnique === true && notNull === true && (
				(!isObject(values[0]) && values.length < count)
				|| (isObject(values[0]) && allValuesCount < count)
			)
		) {
			// console.log(maxRepeatedValuesCount, values.length, allValuesCount, count)
			throw new Error('There are no enough values to fill unique column.');
		}
	}

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		this.checks({ count });

		let { maxRepeatedValuesCount } = this;
		const { params, isUnique, notNull, weightedCountSeed } = this;

		const values = params.values;

		let valuesWeightedIndices;
		if (isObject(values[0])) {
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
			if (!isObject(values[0])) {
				genIndicesObj = new GenerateUniqueInt({ minValue: 0, maxValue: values.length - 1 });
				genIndicesObj.genMaxRepeatedValuesCount = genMaxRepeatedValuesCount;
				genIndicesObj.skipCheck = true;
				genIndicesObj.init({ count, seed });
			} else if (isObject(values[0])) {
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
	static override readonly entityKind: string = 'GenerateSelfRelationsValuesFromArray';

	private state: {
		rng: prand.RandomGenerator;
		firstValuesCount: number;
		firstValues: (string | number | boolean)[];
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
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
	static override readonly entityKind: string = 'GenerateIntPrimaryKey';

	public maxValue?: number | bigint;

	override init({ count }: { count: number; seed: number }) {
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
		arraySize?: number;
	}
> {
	static override readonly entityKind: string = 'GenerateNumber';

	private state: {
		rng: prand.RandomGenerator;
		minValue: number;
		maxValue: number;
		precision: number;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueNumber;

	override init({ count, seed }: { seed: number; count: number }) {
		super.init({ count, seed });

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
	}
> {
	static override readonly entityKind: string = 'GenerateUniqueNumber';

	private state: {
		genUniqueIntObj: GenerateUniqueInt;
		minValue: number;
		maxValue: number;
		precision: number;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateInt';

	private state: {
		rng: prand.RandomGenerator;
		minValue: number | bigint;
		maxValue: number | bigint;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueInt;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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
	static override readonly entityKind: string = 'GenerateUniqueInt';

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

	override init({ count, seed }: { count: number; seed: number }) {
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

export class GenerateBoolean extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateBoolean';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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

export class GenerateDate extends AbstractGenerator<{
	minDate?: string | Date;
	maxDate?: string | Date;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateDate';

	private state: {
		rng: prand.RandomGenerator;
		minDate: Date;
		maxDate: Date;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });
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
export class GenerateTime extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateTime';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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
	static override readonly entityKind: string = 'GenerateTimestampInt';

	private state: {
		generateTimestampObj: GenerateTimestamp;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		const generateTimestampObj = new GenerateTimestamp({});
		generateTimestampObj.dataType = 'date';
		generateTimestampObj.init({ count, seed });

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

export class GenerateTimestamp extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateTimestamp';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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

export class GenerateDatetime extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateDatetime';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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

export class GenerateYear extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateYear';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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

export class GenerateJson extends AbstractGenerator<{ arraySize?: number }> {
	static override readonly entityKind: string = 'GenerateJson';

	private state: {
		emailGeneratorObj: GenerateEmail;
		nameGeneratorObj: GenerateFirstName;
		booleanGeneratorObj: GenerateBoolean;
		salaryGeneratorObj: GenerateInt;
		dateGeneratorObj: GenerateDate;
		visitedCountriesNumberGeneratorObj: GenerateInt;
		seed: number;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const emailGeneratorObj = new GenerateEmail({});
		emailGeneratorObj.init({ count, seed });

		const nameGeneratorObj = new GenerateFirstName({});
		nameGeneratorObj.init({ count, seed });

		const booleanGeneratorObj = new GenerateBoolean({});
		booleanGeneratorObj.init({
			count,
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
		dateGeneratorObj.init({ count, seed });

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
	static override readonly entityKind: string = 'GenerateEnum';

	private state: {
		enumValuesGenerator: GenerateValuesFromArray;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
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

export class GenerateInterval extends AbstractGenerator<{
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateInterval';

	private state: {
		rng: prand.RandomGenerator;
		fieldsToGenerate: string[];
	} | undefined;
	override uniqueVersionOfGen: new(params: any) => AbstractGenerator<any> = GenerateUniqueInterval;
	private config: { [key: string]: { from: number; to: number } } = {
		year: {
			from: 0,
			to: 5,
		},
		month: {
			from: 0,
			to: 12,
		},
		day: {
			from: 1,
			to: 29,
		},
		hour: {
			from: 0,
			to: 24,
		},
		minute: {
			from: 0,
			to: 60,
		},
		second: {
			from: 0,
			to: 60,
		},
	};

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

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

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng, fieldsToGenerate };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		let interval = '', numb: number;

		for (const field of this.state.fieldsToGenerate) {
			const from = this.config[field]!.from, to = this.config[field]!.to;
			[numb, this.state.rng] = prand.uniformIntDistribution(from, to, this.state.rng);
			interval += `${numb} ${field} `;
		}

		return interval;
	}
}

// has a newer version
export class GenerateUniqueInterval extends AbstractGenerator<{
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
			to: 12,
		},
		day: {
			from: 1,
			to: 29,
		},
		hour: {
			from: 0,
			to: 24,
		},
		minute: {
			from: 0,
			to: 60,
		},
		second: {
			from: 0,
			to: 60,
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

// has a newer version
export class GenerateString extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateString';

	private state: { rng: prand.RandomGenerator } | undefined;
	override uniqueVersionOfGen = GenerateUniqueString;

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

// has a newer version
export class GenerateUniqueString extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly entityKind: string = 'GenerateUniqueString';

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

export class GenerateUUID extends AbstractGenerator<{
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateUUID';

	public override isUnique = true;

	private state: { rng: prand.RandomGenerator } | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}
		// TODO generate uuid using string generator
		const stringChars = '1234567890abcdef';
		let idx: number,
			currStr: string;
		const strLength = 36;

		// uuid v4
		const uuidTemplate = '########-####-4###-####-############';
		currStr = '';
		for (let i = 0; i < strLength; i++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(
				0,
				stringChars.length - 1,
				this.state.rng,
			);

			if (uuidTemplate[i] === '#') {
				currStr += stringChars[idx];
				continue;
			}
			currStr += uuidTemplate[i];
		}
		return currStr;
	}
}

export class GenerateFirstName extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateFirstName';

	override timeSpent: number = 0;
	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueFirstName;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxFirstNameLength) {
			throw new Error(
				`You can't use first name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxFirstNameLength}.`,
			);
		}

		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}

		// logic for this generator
		// names dataset contains about 30000 unique names.
		let idx: number;

		[idx, this.state.rng] = prand.uniformIntDistribution(0, firstNames.length - 1, this.state.rng);
		return firstNames[idx] as string;
	}
}

export class GenerateUniqueFirstName extends AbstractGenerator<{
	isUnique?: boolean;
}> {
	static override readonly entityKind: string = 'GenerateUniqueFirstName';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		if (count > firstNames.length) {
			throw new Error('count exceeds max number of unique first names.');
		}

		if (this.stringLength !== undefined && this.stringLength < maxFirstNameLength) {
			throw new Error(
				`You can't use first name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxFirstNameLength}.`,
			);
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

export class GenerateLastName extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateLastName';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueLastName;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxLastNameLength) {
			throw new Error(
				`You can't use last name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxLastNameLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniqueLastName';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		if (count > lastNames.length) {
			throw new Error('count exceeds max number of unique last names.');
		}

		if (this.stringLength !== undefined && this.stringLength < maxLastNameLength) {
			throw new Error(
				`You can't use last name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxLastNameLength}.`,
			);
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateFullName';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueFullName;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < (maxFirstNameLength + maxLastNameLength + 1)) {
			throw new Error(
				`You can't use full name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${
					maxFirstNameLength + maxLastNameLength + 1
				}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniqueFullName';

	private state: {
		fullnameSet: Set<string>;
		rng: prand.RandomGenerator;
	} | undefined;
	public override isUnique = true;
	public override timeSpent = 0;

	override init({ count, seed }: { count: number; seed: number }) {
		const t0 = new Date();

		const maxUniqueFullNamesNumber = firstNames.length * lastNames.length;
		if (count > maxUniqueFullNamesNumber) {
			throw new RangeError(
				`count exceeds max number of unique full names(${maxUniqueFullNamesNumber}).`,
			);
		}

		if (this.stringLength !== undefined && this.stringLength < (maxFirstNameLength + maxLastNameLength + 1)) {
			throw new Error(
				`You can't use full name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${
					maxFirstNameLength + maxLastNameLength + 1
				}.`,
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

export class GenerateEmail extends AbstractGenerator<{
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateEmail';

	private state: {
		genIndicesObj: GenerateUniqueInt;
		arraysToGenerateFrom: string[][];
	} | undefined;
	public override timeSpent: number = 0;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const domainsArray = emailDomains;
		const adjectivesArray = adjectives;
		const namesArray = firstNames;

		const maxUniqueEmailsNumber = adjectivesArray.length * namesArray.length * domainsArray.length;
		if (count > maxUniqueEmailsNumber) {
			throw new RangeError(
				`count exceeds max number of unique emails(${maxUniqueEmailsNumber}).`,
			);
		}

		const maxEmailLength = maxAdjectiveLength + maxFirstNameLength + maxEmailDomainLength + 2;
		if (this.stringLength !== undefined && this.stringLength < maxEmailLength) {
			throw new Error(
				`You can't use email generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxEmailLength}.`,
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GeneratePhoneNumber';

	private state: {
		rng: prand.RandomGenerator;
		placeholdersCount?: number;
		prefixesArray: string[];
		generatedDigitsNumbers: number[];
		generatorsMap: Map<string, GenerateUniqueInt>;
		phoneNumbersSet: Set<string>;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		let { generatedDigitsNumbers } = this.params;
		const { prefixes, template } = this.params;

		const rng = prand.xoroshiro128plus(seed);

		if (template !== undefined) {
			if (this.stringLength !== undefined && this.stringLength < template.length) {
				throw new Error(
					`Length of phone number template is shorter than db column length restriction: ${this.stringLength}. 
					Set the maximum string length to at least ${template.length}.`,
				);
			}

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

		const maxPrefixLength = Math.max(...prefixesArray.map((prefix) => prefix.length));
		const maxGeneratedDigits = Math.max(...generatedDigitsNumbers);

		if (this.stringLength !== undefined && this.stringLength < (maxPrefixLength + maxGeneratedDigits)) {
			throw new Error(
				`You can't use phone number generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${
					maxPrefixLength + maxGeneratedDigits
				}.`,
			);
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

			phoneNumber = prefix + '' + numberBody;

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

export class GenerateCountry extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateCountry';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCountry;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxCountryLength) {
			throw new Error(
				`You can't use country generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCountryLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniqueCountry';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		if (count > countries.length) {
			throw new Error('count exceeds max number of unique countries.');
		}

		if (this.stringLength !== undefined && this.stringLength < maxCountryLength) {
			throw new Error(
				`You can't use country generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCountryLength}.`,
			);
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

export class GenerateJobTitle extends AbstractGenerator<{
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateJobTitle';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxJobTitleLength) {
			throw new Error(
				`You can't use job title generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxJobTitleLength}.`,
			);
		}

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

export class GenerateStreetAddress extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateStreetAddress';

	private state: {
		rng: prand.RandomGenerator;
		possStreetNames: string[][];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueStreetAddress;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		const possStreetNames = [firstNames, lastNames];

		const maxStreetAddressLength = 4 + Math.max(maxFirstNameLength, maxLastNameLength) + 1 + maxStreetSuffixLength;
		if (this.stringLength !== undefined && this.stringLength < maxStreetAddressLength) {
			throw new Error(
				`You can't use street address generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxStreetAddressLength}.`,
			);
		}

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

export class GenerateUniqueStreetAddress extends AbstractGenerator<{ isUnique?: boolean }> {
	static override readonly entityKind: string = 'GenerateUniqueStreetAddress';

	private state: {
		rng: prand.RandomGenerator;
		possStreetNameObjs: {
			indicesGen: GenerateUniqueInt;
			maxUniqueStreetNamesNumber: number;
			count: number;
			arraysToChooseFrom: string[][];
		}[];
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		const streetNumberStrs = Array.from({ length: 999 }, (_, i) => String(i + 1));
		const maxUniqueStreetnamesNumber = streetNumberStrs.length * firstNames.length * streetSuffix.length
			+ streetNumberStrs.length * firstNames.length * streetSuffix.length;

		if (count > maxUniqueStreetnamesNumber) {
			throw new RangeError(
				`count exceeds max number of unique street names(${maxUniqueStreetnamesNumber}).`,
			);
		}

		const maxStreetAddressLength = 4 + Math.max(maxFirstNameLength, maxLastNameLength) + 1 + maxStreetSuffixLength;
		if (this.stringLength !== undefined && this.stringLength < maxStreetAddressLength) {
			throw new Error(
				`You can't use street address generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxStreetAddressLength}.`,
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

export class GenerateCity extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateCity';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCity;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxCityNameLength) {
			throw new Error(
				`You can't use city generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCityNameLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniqueCity';

	private state: {
		genIndicesObj: GenerateUniqueInt;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		if (count > cityNames.length) {
			throw new Error('count exceeds max number of unique cities.');
		}

		if (this.stringLength !== undefined && this.stringLength < maxCityNameLength) {
			throw new Error(
				`You can't use city generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCityNameLength}.`,
			);
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

export class GeneratePostcode extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GeneratePostcode';

	private state: {
		rng: prand.RandomGenerator;
		templates: string[];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniquePostcode;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		const templates = ['#####', '#####-####'];

		const maxPostcodeLength = Math.max(...templates.map((template) => template.length));
		if (this.stringLength !== undefined && this.stringLength < maxPostcodeLength) {
			throw new Error(
				`You can't use postcode generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxPostcodeLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniquePostcode';

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
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
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

		const maxPostcodeLength = Math.max(...templates.map((template) => template.template.length));
		if (this.stringLength !== undefined && this.stringLength < maxPostcodeLength) {
			throw new Error(
				`You can't use postcode generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxPostcodeLength}.`,
			);
		}

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

export class GenerateState extends AbstractGenerator<{
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateState';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);

		if (this.stringLength !== undefined && this.stringLength < maxStateLength) {
			throw new Error(
				`You can't use state generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxStateLength}.`,
			);
		}

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

export class GenerateCompanyName extends AbstractGenerator<{
	isUnique?: boolean;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateCompanyName';

	private state: {
		rng: prand.RandomGenerator;
		templates: { template: string; placeholdersCount: number }[];
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueCompanyName;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		const templates = [
			{ template: '#', placeholdersCount: 1 },
			{ template: '# - #', placeholdersCount: 2 },
			{ template: '# and #', placeholdersCount: 2 },
			{ template: '#, # and #', placeholdersCount: 3 },
		];

		// max( { template: '#', placeholdersCount: 1 }, { template: '#, # and #', placeholdersCount: 3 } )
		const maxCompanyNameLength = Math.max(
			maxLastNameLength + maxCompanyNameSuffixLength + 1,
			3 * maxLastNameLength + 7,
		);
		if (this.stringLength !== undefined && this.stringLength < maxCompanyNameLength) {
			throw new Error(
				`You can't use company name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCompanyNameLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'GenerateUniqueCompanyName';

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
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
		const maxUniqueCompanyNameNumber = lastNames.length * companyNameSuffixes.length + Math.pow(lastNames.length, 2)
			+ Math.pow(lastNames.length, 2) + Math.pow(lastNames.length, 3);
		if (count > maxUniqueCompanyNameNumber) {
			throw new RangeError(
				`count exceeds max number of unique company names(${maxUniqueCompanyNameNumber}).`,
			);
		}

		// max( { template: '#', placeholdersCount: 1 }, { template: '#, # and #', placeholdersCount: 3 } )
		const maxCompanyNameLength = Math.max(
			maxLastNameLength + maxCompanyNameSuffixLength + 1,
			3 * maxLastNameLength + 7,
		);
		if (this.stringLength !== undefined && this.stringLength < maxCompanyNameLength) {
			throw new Error(
				`You can't use company name generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxCompanyNameLength}.`,
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

export class GenerateLoremIpsum extends AbstractGenerator<{
	sentencesCount?: number;
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateLoremIpsum';

	private state: {
		rng: prand.RandomGenerator;
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		if (this.params.sentencesCount === undefined) this.params.sentencesCount = 1;

		const maxLoremIpsumSentencesLength = maxLoremIpsumLength * this.params.sentencesCount + this.params.sentencesCount
			- 1;
		if (this.stringLength !== undefined && this.stringLength < maxLoremIpsumSentencesLength) {
			throw new Error(
				`You can't use lorem ipsum generator with a db column length restriction of ${this.stringLength}. Set the maximum string length to at least ${maxLoremIpsumSentencesLength}.`,
			);
		}

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
	static override readonly entityKind: string = 'WeightedRandomGenerator';

	private state: {
		rng: prand.RandomGenerator;
		weightedIndices: number[];
	} | undefined;

	override init({ count, seed }: { count: number; seed: number }) {
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GeneratePoint';

	private state: {
		xCoordinateGen: GenerateNumber;
		yCoordinateGen: GenerateNumber;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniquePoint;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const xCoordinateGen = new GenerateNumber({
			minValue: this.params.minXValue,
			maxValue: this.params.maxXValue,
			precision: 10,
		});
		xCoordinateGen.init({ count, seed });

		const yCoordinateGen = new GenerateNumber({
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

export class GenerateUniquePoint extends AbstractGenerator<{
	minXValue?: number;
	maxXValue?: number;
	minYValue?: number;
	maxYValue?: number;
	isUnique?: boolean;
}> {
	static override readonly entityKind: string = 'GenerateUniquePoint';

	private state: {
		xCoordinateGen: GenerateUniqueNumber;
		yCoordinateGen: GenerateUniqueNumber;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
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
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateLine';

	private state: {
		aCoefficientGen: GenerateNumber;
		bCoefficientGen: GenerateNumber;
		cCoefficientGen: GenerateNumber;
	} | undefined;
	override uniqueVersionOfGen = GenerateUniqueLine;

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const aCoefficientGen = new GenerateNumber({
			minValue: this.params.minAValue,
			maxValue: this.params.maxAValue,
			precision: 10,
		});
		aCoefficientGen.init({ count, seed });

		const bCoefficientGen = new GenerateNumber({
			minValue: this.params.minBValue,
			maxValue: this.params.maxBValue,
			precision: 10,
		});
		bCoefficientGen.init({ count, seed });

		const cCoefficientGen = new GenerateNumber({
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

export class GenerateUniqueLine extends AbstractGenerator<{
	minAValue?: number;
	maxAValue?: number;
	minBValue?: number;
	maxBValue?: number;
	minCValue?: number;
	maxCValue?: number;
	isUnique?: boolean;
}> {
	static override readonly entityKind: string = 'GenerateUniqueLine';

	private state: {
		aCoefficientGen: GenerateUniqueNumber;
		bCoefficientGen: GenerateUniqueNumber;
		cCoefficientGen: GenerateUniqueNumber;
	} | undefined;
	public override isUnique = true;

	override init({ count, seed }: { count: number; seed: number }) {
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
