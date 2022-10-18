import { eq } from 'drizzle-orm/expressions';
import { alias } from '~/alias';

import { Equal, Expect } from '../utils';
import { db } from './db';
import { cities, classes, users } from './tables';

const city = alias(cities, 'city');
const city1 = alias(cities, 'city1');

const join2 = await db.select(users)
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id), { id: city.id })
	.execute();

Expect<
	Equal<{
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
		cities_table: {
			id: number;
			name: string;
			population: number | null;
		} | null;
		city: {
			id: number;
			name: string;
			population: number | null;
		} | null;
		city1: {
			id: number;
		};
	}[], typeof join2>
>;

const join3 = await db.select(users).fields({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id })
	.execute();

Expect<
	Equal<
		({
			users_table: { id: number };
			cities_table: null;
		} | {
			users_table: null;
			cities_table: { id: number };
		} | {
			users_table: { id: number };
			cities_table: { id: number };
		})[],
		typeof join3
	>
>;

const join4 = await db.select(users).fields({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id })
	.rightJoin(classes, eq(users.id, classes.id), { id: classes.id })
	.execute();

Expect<
	Equal<
		{
			users_table: { id: number } | null;
			cities_table: { id: number } | null;
			classes_table: { id: number };
		}[],
		typeof join4
	>
>;
