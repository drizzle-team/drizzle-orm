import lastNames from '../../src/datasets/lastNames.ts';
import {
	GenerateBoolean,
	GenerateCity,
	GenerateCompanyName,
	GenerateCountry,
	GenerateDate,
	GenerateDatetime,
	GenerateDefault,
	GenerateEmail,
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
	GenerateState,
	GenerateStreetAddress,
	GenerateString,
	GenerateTime,
	GenerateTimestamp,
	GenerateUniqueCompanyName,
	GenerateUniqueFullName,
	GenerateUniqueInt,
	GenerateUniqueInterval,
	GenerateUniqueLine,
	GenerateUniqueNumber,
	GenerateUniquePoint,
	GenerateUniquePostcode,
	GenerateUniqueStreetAddress,
	GenerateUniqueString,
	GenerateValuesFromArray,
	GenerateYear,
	WeightedRandomGenerator,
} from '../../src/services/Generators.ts';

const benchmark = ({ generatorName, generator, count = 100000, seed = 1 }: {
	generatorName: string;
	generator: (typeof generatorsFuncs)[keyof typeof generatorsFuncs];
	count?: number;
	seed?: number;
}) => {
	generator.init({ count, seed });

	let timeSpentToInit = 0, timeSpent = 0;
	const t0 = new Date();

	generator.init({ count, seed });
	timeSpentToInit += (Date.now() - t0.getTime()) / 1000;

	for (let i = 0; i < count; i++) {
		const val = generator.generate({ i });
		if (val === undefined) {
			console.log(val, `in ${generatorName} generator.`);
		}
	}

	timeSpent += (Date.now() - t0.getTime()) / 1000;
	console.log(`${generatorName} spent ${timeSpentToInit} to init and spent ${timeSpent} to generate ${count} rows.`);
	console.log(
		'time spent in particular code part:',
		generator.timeSpent,
		';',
		generator.timeSpent === undefined ? generator.timeSpent : (generator.timeSpent / timeSpent),
		'percent of all time',
	);
	console.log('\n');
};

const generatorsFuncs = {
	default: new GenerateDefault({ defaultValue: 'defaultValue' }),
	valuesFromArray: new GenerateValuesFromArray({ values: lastNames }),
	intPrimaryKey: new GenerateIntPrimaryKey({}),
	number: new GenerateNumber({}),
	uniqueNumber: new GenerateUniqueNumber({}),
	int: new GenerateInt({}),
	uniqueInt: new GenerateUniqueInt({}),
	boolean: new GenerateBoolean({}),
	date: new GenerateDate({}),
	time: new GenerateTime({}),
	timestamp: new GenerateTimestamp({}),
	datetime: new GenerateDatetime({}),
	year: new GenerateYear({}),
	json: new GenerateJson({}),
	jsonb: new GenerateJson({}),
	interval: new GenerateInterval({}),
	uniqueInterval: new GenerateUniqueInterval({}),
	string: new GenerateString({}),
	uniqueString: new GenerateUniqueString({}),
	firstName: new GenerateFirstName({}),
	// uniqueFirstName: new GenerateUniqueName({}),
	lastName: new GenerateLastName({}),
	// uniqueLastName: new GenerateUniqueSurname({}),
	fullName: new GenerateFullName({}),
	uniqueFullName: new GenerateUniqueFullName({}),
	email: new GenerateEmail({}),
	phoneNumber: new GeneratePhoneNumber({ template: '+380 ## ## ### ##' }),
	country: new GenerateCountry({}),
	// uniqueCountry: new GenerateUniqueCountry({}),
	city: new GenerateCity({}),
	// uniqueCity: new GenerateUniqueCity({}),
	streetAddress: new GenerateStreetAddress({}),
	uniqueStreetAddress: new GenerateUniqueStreetAddress({}),
	jobTitle: new GenerateJobTitle({}),
	postcode: new GeneratePostcode({}),
	uniquePostcode: new GenerateUniquePostcode({}),
	state: new GenerateState({}),
	companyName: new GenerateCompanyName({}),
	uniqueCompanyName: new GenerateUniqueCompanyName({}),
	loremIpsum: new GenerateLoremIpsum({}),
	point: new GeneratePoint({}),
	uniquePoint: new GenerateUniquePoint({}),
	line: new GenerateLine({}),
	uniqueLine: new GenerateUniqueLine({}),
	weightedRandom: new WeightedRandomGenerator([
		{ weight: 0.8, value: new GenerateUniqueInt({ minValue: 0, maxValue: 90000 }) },
		{ weight: 0.2, value: new GenerateDefault({ defaultValue: Number.NaN }) },
	]),
};

for (const [generatorName, generator] of Object.entries(generatorsFuncs)) {
	benchmark({ generatorName, generator, count: 100000, seed: 1 });
}
