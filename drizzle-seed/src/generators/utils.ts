/* eslint-disable drizzle-internal/require-entity-kind */

export const fastCartesianProduct = (
	sets: ((number | string | boolean | object)[] | OrderedNumberRange)[],
	index: number,
) => {
	const resultList = [];
	let currSet: (typeof sets)[number];
	let element: (typeof sets)[number][number];

	for (let i = sets.length - 1; i >= 0; i--) {
		currSet = sets[i]!;
		element = currSet[index % currSet.length]!;
		resultList.unshift(element);
		index = Math.floor(index / currSet.length);
	}

	return resultList;
};

export const fastCartesianProductForBigint = (
	sets: ((number | string | boolean | object)[] | OrderedNumberRange)[],
	index: bigint,
) => {
	const resultList = [];
	let currSet: (typeof sets)[number];
	let element: (typeof sets)[number][number];

	for (let i = sets.length - 1; i >= 0; i--) {
		currSet = sets[i]!;
		const remainder = Number(index % BigInt(currSet.length));
		element = currSet[remainder]!;
		resultList.unshift(element);
		index = index / BigInt(currSet.length);
	}

	return resultList;
};

export class OrderedNumberRange<T extends number = number> {
	// Tell TS “obj[n]” will be a T:
	[index: number]: T;
	public readonly length: number;

	constructor(
		private readonly min: number,
		private readonly max: number,
		private readonly step: number,
	) {
		this.length = Math.floor((this.max - this.min) / this.step) + 1;

		const handler: ProxyHandler<OrderedNumberRange<T>> = {
			get(
				target: OrderedNumberRange<T>,
				prop: PropertyKey,
				receiver: any,
			): T | unknown {
				if (typeof prop === 'string' && /^\d+$/.test(prop)) {
					const idx = Number(prop);
					if (idx >= target.length) return undefined;
					return (target.min + idx * target.step) as T;
				}
				// fallback to normal lookup (and TS knows this has the right signature)
				return Reflect.get(target, prop, receiver);
			},
		};

		return new Proxy(this, handler);
	}
}

const sumArray = (weights: number[]) => {
	const scale = 1e10;
	const scaledSum = weights.reduce((acc, currVal) => acc + Math.round(currVal * scale), 0);
	return scaledSum / scale;
};

/**
 * @param weights positive number in range [0, 1], that represents probabilities to choose index of array. Example: weights = [0.2, 0.8]
 * @param [accuracy=100] approximate number of elements in returning array
 * @returns Example: with weights = [0.2, 0.8] and accuracy = 10 returning array of indices gonna equal this: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
 */
export const getWeightedIndices = (weights: number[], accuracy = 100) => {
	const weightsSum = sumArray(weights);
	if (weightsSum !== 1) {
		throw new Error(
			`The weights for the Weighted Random feature must add up to exactly 1. Please review your weights to ensure they total 1 before proceeding`,
		);
	}

	// const accuracy = 100;
	const weightedIndices: number[] = [];
	for (const [index, weight] of weights.entries()) {
		const ticketsNumb = Math.floor(weight * accuracy);
		weightedIndices.push(...Array.from<number>({ length: ticketsNumb }).fill(index));
	}

	return weightedIndices;
};

/**
 * @param param0.template example: "#####" or "#####-####"
 * @param param0.values example: ["3", "2", "h"]
 * @param param0.defaultValue example: "0"
 * @returns
 */
export const fillTemplate = ({ template, placeholdersCount, values, defaultValue = ' ' }: {
	template: string;
	placeholdersCount?: number;
	values: string[];
	defaultValue?: string;
}) => {
	if (placeholdersCount === undefined) {
		const iterArray = [...template.matchAll(/#/g)];
		placeholdersCount = iterArray.length;
	}

	const diff = placeholdersCount - values.length;
	if (diff > 0) {
		values.unshift(...Array.from<string>({ length: diff }).fill(defaultValue));
	}

	let resultStr = '', valueIdx = 0;
	for (const si of template) {
		if (si === '#') {
			resultStr += values[valueIdx];
			valueIdx += 1;
			continue;
		}
		resultStr += si;
	}

	return resultStr;
};

// is variable is object-like.
// Example:
// isObject({f: 4}) === true;
// isObject([1,2,3]) === false;
// isObject(new Set()) === false;
export const isObject = (value: any) => {
	if (value !== null && value !== undefined && value.constructor === Object) return true;
	return false;
};

// const main = () => {
// 	console.time('range');
// 	const range = new OrderedNumberRange(-10, 10, 0.01);

// 	console.log(range.length);
// 	for (let i = 0; i < 2001 + 1; i++) {
// 		console.log(range[i]);
// 	}
// 	console.timeEnd('range');

// 	console.time('list');
// 	const list = Array.from({ length: 2e6 + 1 }, (_, idx) => idx);

// 	console.log(list.length);
// 	for (let i = 0; i < 2e6 + 1; i++) {
// 		list[i];
// 	}
// 	console.timeEnd('list');

// 	const n = 5;
// 	for (let i = 0; i < n; i++) {
// 		console.log(fastCartesianProduct([[1, 2], [1, 2]], i));
// 	}
// };

// main();
