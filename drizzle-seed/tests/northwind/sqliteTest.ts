import 'dotenv/config';
import path from 'path';

import betterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { seed } from '../../src/index.ts';
import * as schema from './sqliteSchema.ts';

const { Sqlite_PATH } = process.env;
const sqliteDb = betterSqlite3(Sqlite_PATH);
const db = drizzle(sqliteDb);

console.log('database connection was established successfully.');

(async () => {
	migrate(db, { migrationsFolder: path.join(__dirname, '../../../sqliteMigrations') });
	console.log('database was migrated.');

	const titlesOfCourtesy = ['Ms.', 'Mrs.', 'Dr.'];
	const unitsOnOrders = [0, 10, 20, 30, 50, 60, 70, 80, 100];
	const reorderLevels = [0, 5, 10, 15, 20, 25, 30];
	const quantityPerUnit = [
		'100 - 100 g pieces',
		'100 - 250 g bags',
		'10 - 200 g glasses',
		'10 - 4 oz boxes',
		'10 - 500 g pkgs.',
		'10 - 500 g pkgs.',
		'10 boxes x 12 pieces',
		'10 boxes x 20 bags',
		'10 boxes x 8 pieces',
		'10 kg pkg.',
		'10 pkgs.',
		'12 - 100 g bars',
		'12 - 100 g pkgs',
		'12 - 12 oz cans',
		'12 - 1 lb pkgs.',
		'12 - 200 ml jars',
		'12 - 250 g pkgs.',
		'12 - 355 ml cans',
		'12 - 500 g pkgs.',
		'750 cc per bottle',
		'5 kg pkg.',
		'50 bags x 30 sausgs.',
		'500 ml',
		'500 g',
		'48 pieces',
		'48 - 6 oz jars',
		'4 - 450 g glasses',
		'36 boxes',
		'32 - 8 oz bottles',
		'32 - 500 g boxes',
	];
	const discounts = [0.05, 0.15, 0.2, 0.25];

	await seed(db, schema).refine((funcs) => ({
		customers: {
			count: 10000,
			columns: {
				companyName: funcs.companyName({}),
				contactName: funcs.fullName({}),
				contactTitle: funcs.jobTitle({}),
				address: funcs.streetAddress({}),
				city: funcs.city({}),
				postalCode: funcs.postcode({}),
				region: funcs.state({}),
				country: funcs.country({}),
				phone: funcs.phoneNumber({ template: '(###) ###-####' }),
				fax: funcs.phoneNumber({ template: '(###) ###-####' }),
			},
		},
		employees: {
			count: 200,
			columns: {
				firstName: funcs.firstName({}),
				lastName: funcs.lastName({}),
				title: funcs.jobTitle({}),
				titleOfCourtesy: funcs.valuesFromArray({ values: titlesOfCourtesy }),
				birthDate: funcs.date({ minDate: '1990-01-01', maxDate: '2010-12-31' }),
				hireDate: funcs.date({ minDate: '2010-12-31', maxDate: '2024-08-26' }),
				address: funcs.streetAddress({}),
				city: funcs.city({}),
				postalCode: funcs.postcode({}),
				country: funcs.country({}),
				homePhone: funcs.phoneNumber({ template: '(###) ###-####' }),
				extension: funcs.int({ minValue: 428, maxValue: 5467 }),
				notes: funcs.loremIpsum({}),
			},
		},
		orders: {
			count: 50000,
			columns: {
				shipVia: funcs.int({ minValue: 1, maxValue: 3 }),
				freight: funcs.number({ minValue: 0, maxValue: 1000, precision: 100 }),
				shipName: funcs.streetAddress({}),
				shipCity: funcs.city({}),
				shipRegion: funcs.state({}),
				shipPostalCode: funcs.postcode({}),
				shipCountry: funcs.country({}),
			},
			with: {
				details: [
					{ weight: 0.6, count: [1, 2, 3, 4] },
					{ weight: 0.2, count: [5, 6, 7, 8, 9, 10] },
					{ weight: 0.15, count: [11, 12, 13, 14, 15, 16, 17] },
					{ weight: 0.05, count: [18, 19, 20, 21, 22, 23, 24, 25] },
				],
			},
		},
		suppliers: {
			count: 1000,
			columns: {
				companyName: funcs.companyName({}),
				contactName: funcs.fullName({}),
				contactTitle: funcs.jobTitle({}),
				address: funcs.streetAddress({}),
				city: funcs.city({}),
				postalCode: funcs.postcode({}),
				region: funcs.state({}),
				country: funcs.country({}),
				phone: funcs.phoneNumber({ template: '(###) ###-####' }),
			},
		},
		products: {
			count: 5000,
			columns: {
				name: funcs.companyName({}),
				quantityPerUnit: funcs.valuesFromArray({ values: quantityPerUnit }),
				unitPrice: funcs.weightedRandom(
					[
						{
							weight: 0.5,
							value: funcs.int({ minValue: 3, maxValue: 300 }),
						},
						{
							weight: 0.5,
							value: funcs.number({ minValue: 3, maxValue: 300, precision: 100 }),
						},
					],
				),
				unitsInStock: funcs.int({ minValue: 0, maxValue: 125 }),
				unitsOnOrder: funcs.valuesFromArray({ values: unitsOnOrders }),
				reorderLevel: funcs.valuesFromArray({ values: reorderLevels }),
				discontinued: funcs.int({ minValue: 0, maxValue: 1 }),
			},
		},
		details: {
			columns: {
				unitPrice: funcs.number({ minValue: 10, maxValue: 130 }),
				quantity: funcs.int({ minValue: 1, maxValue: 130 }),
				discount: funcs.weightedRandom(
					[
						{ weight: 0.5, value: funcs.valuesFromArray({ values: discounts }) },
						{ weight: 0.5, value: funcs.default({ defaultValue: 0 }) },
					],
				),
			},
		},
	}));
})().then();
