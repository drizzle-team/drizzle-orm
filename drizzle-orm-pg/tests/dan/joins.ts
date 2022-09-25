import { eq } from 'drizzle-orm/expressions';

import { Equal, Expect } from '../utils';
import { db } from './db';
import { cities, classes, users } from './tables';

const join2 = await db.users.select()
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin({ city: cities }, (aliases) => eq(aliases.city.id, users.id))
	.rightJoin({ city1: cities }, (aliases) => eq(aliases.city1.id, users.id), (city) => ({ id: city.id }))
	.execute();

Expect<
	Equal<{
		users: {
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
		cities: {
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

const join3 = await db.users.select({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id })
	.execute();

Expect<
	Equal<
		({
			users: { id: number };
			cities: null;
		} | {
			users: null;
			cities: { id: number };
		} | {
			users: { id: number };
			cities: { id: number };
		})[],
		typeof join3
	>
>;

const join4 = await db.users.select({ id: users.id })
	.fullJoin(cities, eq(users.id, cities.id), { id: cities.id })
	.rightJoin(classes, eq(users.id, classes.id), { id: classes.id })
	.execute();

Expect<
	Equal<
		{
			users: { id: number } | null;
			cities: { id: number } | null;
			classes: { id: number };
		}[],
		typeof join4
	>
>;
