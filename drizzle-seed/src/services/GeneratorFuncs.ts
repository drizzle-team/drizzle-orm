import type { AbstractGenerator } from './Generators.ts';
import {
	GenerateArray,
	GenerateBoolean,
	GenerateCity,
	GenerateCompanyName,
	GenerateCountry,
	GenerateDate,
	GenerateDatetime,
	GenerateDefault,
	GenerateEmail,
	GenerateEnum,
	GenerateFirstName,
	GenerateFullName,
	GenerateInt,
	GenerateInterval,
	GenerateIntPrimaryKey,
	GenerateJobTitle,
	GenerateJson,
	GenerateLastName,
	GenerateLine,
	GenerateLoremIpsum,
	GenerateNumber,
	GeneratePhoneNumber,
	GeneratePoint,
	GeneratePostcode,
	GenerateSelfRelationsValuesFromArray,
	GenerateState,
	GenerateStreetAddress,
	GenerateString,
	GenerateTime,
	GenerateTimestamp,
	GenerateUniqueCity,
	GenerateUniqueCompanyName,
	GenerateUniqueCountry,
	GenerateUniqueFirstName,
	GenerateUniqueFullName,
	GenerateUniqueInt,
	GenerateUniqueInterval,
	GenerateUniqueLastName,
	GenerateUniqueLine,
	GenerateUniqueNumber,
	GenerateUniquePoint,
	GenerateUniquePostcode,
	GenerateUniqueStreetAddress,
	GenerateUniqueString,
	GenerateUUID,
	GenerateValuesFromArray,
	GenerateWeightedCount,
	GenerateYear,
	HollowGenerator,
	WeightedRandomGenerator,
} from './Generators.ts';
import { GenerateStringV2, GenerateUniqueIntervalV2, GenerateUniqueStringV2 } from './versioning/v2.ts';

function createGenerator<GeneratorType extends AbstractGenerator<T>, T>(
	generatorConstructor: new(params?: T) => GeneratorType,
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

export const generatorsFuncs = {
	/**
	 * generates same given value each time the generator is called.
	 * @param defaultValue - value you want to generate
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 *
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 *
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 *
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 *
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 * @param fields - range of values you want to see in your intervals.
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * generates v4 UUID strings if arraySize is not specified, or v4 UUID 1D arrays if it is.
	 *
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
	 *
	 * @example
	 * ```ts
	 *  await seed(db, schema, { count: 1000 }).refine((funcs) => ({
	 *    users: {
	 *      columns: {
	 *        uuid: funcs.uuid({
	 *          arraySize: 4
	 *        })
	 *      },
	 *    },
	 *  }));
	 * ```
	 */
	uuid: createGenerator(GenerateUUID),

	/**
	 * generates person's first names.
	 * @param isUnique - property that controls if generated values gonna be unique or not.
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	streetAddress: createGenerator(GenerateStreetAddress),
	// uniqueStreetAddress: createGenerator(GenerateUniqueStreetAddress),

	/**
	 * generates job titles.
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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
	 * @param arraySize - number of elements in each one-dimensional array. (If specified, arrays will be generated.)
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

// so far, version changes don’t affect generator parameters.
export const generatorsFuncsV2 = {
	...generatorsFuncs,
};

export const generatorsMap = {
	HollowGenerator: [
		HollowGenerator,
	],
	GenerateDefault: [
		GenerateDefault,
	],
	GenerateValuesFromArray: [
		GenerateValuesFromArray,
	],
	GenerateSelfRelationsValuesFromArray: [
		GenerateSelfRelationsValuesFromArray,
	],
	GenerateIntPrimaryKey: [
		GenerateIntPrimaryKey,
	],
	GenerateNumber: [
		GenerateNumber,
	],
	GenerateUniqueNumber: [
		GenerateUniqueNumber,
	],
	GenerateInt: [
		GenerateInt,
	],
	GenerateUniqueInt: [
		GenerateUniqueInt,
	],
	GenerateBoolean: [
		GenerateBoolean,
	],
	GenerateDate: [
		GenerateDate,
	],
	GenerateTime: [
		GenerateTime,
	],
	GenerateTimestamp: [
		GenerateTimestamp,
	],
	GenerateDatetime: [
		GenerateDatetime,
	],
	GenerateYear: [
		GenerateYear,
	],
	GenerateJson: [
		GenerateJson,
	],
	GenerateEnum: [
		GenerateEnum,
	],
	GenerateInterval: [
		GenerateInterval,
	],
	GenerateUniqueInterval: [
		GenerateUniqueInterval,
		GenerateUniqueIntervalV2,
	],
	GenerateString: [
		GenerateString,
		GenerateStringV2,
	],
	GenerateUniqueString: [
		GenerateUniqueString,
		GenerateUniqueStringV2,
	],
	GenerateUUID: [
		GenerateUUID,
	],
	GenerateFirstName: [
		GenerateFirstName,
	],
	GenerateUniqueFirstName: [
		GenerateUniqueFirstName,
	],
	GenerateLastName: [
		GenerateLastName,
	],
	GenerateUniqueLastName: [
		GenerateUniqueLastName,
	],
	GenerateFullName: [
		GenerateFullName,
	],
	GenerateUniqueFullName: [
		GenerateUniqueFullName,
	],
	GenerateEmail: [
		GenerateEmail,
	],
	GeneratePhoneNumber: [
		GeneratePhoneNumber,
	],
	GenerateCountry: [
		GenerateCountry,
	],
	GenerateUniqueCountry: [
		GenerateUniqueCountry,
	],
	GenerateCity: [
		GenerateCity,
	],
	GenerateUniqueCity: [
		GenerateUniqueCity,
	],
	GenerateStreetAddress: [
		GenerateStreetAddress,
	],
	GenerateUniqueStreetAddress: [
		GenerateUniqueStreetAddress,
	],
	GenerateJobTitle: [
		GenerateJobTitle,
	],
	GeneratePostcode: [
		GeneratePostcode,
	],
	GenerateUniquePostcode: [
		GenerateUniquePostcode,
	],
	GenerateState: [
		GenerateState,
	],
	GenerateCompanyName: [
		GenerateCompanyName,
	],
	GenerateUniqueCompanyName: [
		GenerateUniqueCompanyName,
	],
	GenerateLoremIpsum: [
		GenerateLoremIpsum,
	],
	GeneratePoint: [
		GeneratePoint,
	],
	GenerateUniquePoint: [
		GenerateUniquePoint,
	],
	GenerateLine: [
		GenerateLine,
	],
	GenerateUniqueLine: [
		GenerateUniqueLine,
	],
	WeightedRandomGenerator: [
		WeightedRandomGenerator,
	],
	GenerateArray: [
		GenerateArray,
	],
	GenerateWeightedCount: [
		GenerateWeightedCount,
	],
} as const;
