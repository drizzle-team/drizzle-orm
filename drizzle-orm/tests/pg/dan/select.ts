import {
	and,
	between,
	eq,
	exists,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notExists,
	notIlike,
	notInArray,
	notLike,
	or,
} from '~/expressions';
import { alias } from '~/pg-core/alias';
import { param, sql } from '~/sql';

import { Equal, Expect } from 'tests/utils';
import { db } from './db';
import { cities, classes, users } from './tables';

const city = alias(cities, 'city');
const city1 = alias(cities, 'city1');

const leftJoinFlat = await db.select(users)
	.fields({
		userId: users.id,
		userText: users.text,
		cityId: city.id,
		cityName: city.name,
	})
	.leftJoin(city, eq(users.id, city.id));

Expect<
	Equal<{
		userId: number;
		userText: string | null;
		cityId: number | null;
		cityName: string | null;
	}[], typeof leftJoinFlat>
>;

const rightJoinFlat = await db.select(users)
	.fields({
		userId: users.id,
		userText: users.text,
		cityId: city.id,
		cityName: city.name,
	})
	.rightJoin(city, eq(users.id, city.id));

Expect<
	Equal<{
		userId: number | null;
		userText: string | null;
		cityId: number;
		cityName: string;
	}[], typeof rightJoinFlat>
>;

const innerJoinFlat = await db.select(users)
	.fields({
		userId: users.id,
		userText: users.text,
		cityId: city.id,
		cityName: city.name,
	})
	.innerJoin(city, eq(users.id, city.id));

Expect<
	Equal<{
		userId: number;
		userText: string | null;
		cityId: number;
		cityName: string;
	}[], typeof innerJoinFlat>
>;

const fullJoinFlat = await db.select(users)
	.fields({
		userId: users.id,
		userText: users.text,
		cityId: city.id,
		cityName: city.name,
	})
	.fullJoin(city, eq(users.id, city.id));

Expect<
	Equal<{
		userId: number | null;
		userText: string | null;
		cityId: number | null;
		cityName: string | null;
	}[], typeof fullJoinFlat>
>;

const leftJoinMixed = await db.select(users)
	.fields({
		id: users.id,
		text: users.text,
		textUpper: sql`upper(${users.text})`.as<string | null>(),
		idComplex: sql`${users.id}::text || ${city.id}::text`.as<string | null>(),
		city: {
			id: city.id,
			name: city.name,
		},
	})
	.leftJoin(city, eq(users.id, city.id));

Expect<
	Equal<
		{
			id: number;
			text: string | null;
			textUpper: string | null;
			idComplex: string | null;
			city: {
				id: number;
				name: string;
			} | null;
		}[],
		typeof leftJoinMixed
	>
>;

const leftJoinMixed2 = await db.select(users)
	.fields({
		id: users.id,
		text: users.text,
		foo: {
			bar: users.uuid,
			baz: cities.id,
		},
	})
	.leftJoin(cities, eq(users.id, cities.id));

Expect<
	Equal<
		{
			id: number;
			text: string | null;
			foo: {
				bar: string;
				baz: number | null;
			};
		}[],
		typeof leftJoinMixed2
	>
>;

const join1 = await db.select(users)
	.fields({
		user: {
			id: users.id,
			text: users.text,
		},
		city: {
			id: city.id,
			name: city.name,
			nameUpper: sql`upper(${city.name})`.as<string>(),
		},
	}).leftJoin(city, eq(users.id, city.id));

Expect<
	Equal<{
		user: {
			id: number;
			text: string | null;
		};
		city: {
			id: number;
			name: string;
			nameUpper: string;
		} | null;
	}[], typeof join1>
>;

const join = await db.select(users)
	.fields({
		users,
		cities,
		city,
		city1: {
			id: city1.id,
		},
	})
	.leftJoin(cities, eq(users.id, cities.id))
	.rightJoin(city, eq(city.id, users.id))
	.rightJoin(city1, eq(city1.id, users.id));

Expect<
	Equal<
		{
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
		}[],
		typeof join
	>
>;

const join2 = await db.select(users)
	.fields({
		user: {
			id: users.id,
		},
		city: {
			id: cities.id,
		},
	})
	.fullJoin(cities, eq(users.id, cities.id));

Expect<
	Equal<
		{
			user: {
				id: number;
			} | null;
			city: {
				id: number;
			} | null;
		}[],
		typeof join2
	>
>;

const join3 = await db.select(users)
	.fields({
		user: {
			id: users.id,
		},
		city: {
			id: cities.id,
		},
		class: {
			id: classes.id,
		},
	})
	.fullJoin(cities, eq(users.id, cities.id))
	.rightJoin(classes, eq(users.id, classes.id));

Expect<
	Equal<
		{
			user: {
				id: number;
			} | null;
			city: {
				id: number;
			} | null;
			class: {
				id: number;
			};
		}[],
		typeof join3
	>
>;

db.select(users)
	.where(exists(
		db.select(cities).where(eq(users.homeCity.unsafe(), cities.id)),
	));

function mapFunkyFuncResult(valueFromDriver: unknown) {
	return {
		foo: (valueFromDriver as Record<string, any>)['foo'],
	};
}

const age = 1;

const allOperators = await db.select(users).fields({
	col2: sql`5 - ${users.id} + 1`, // unknown
	col3: sql`${users.id} + 1`.as<number>(), // number
	col33: sql`${users.id} + 1`.as(users.id), // number
	col34: sql`${users.id} + 1`.as(mapFunkyFuncResult), // number
	col4: sql`one_or_another(${users.id}, ${users.class})`.as<string | number>(), // string | number
	col5: sql`true`, // unknown
	col6: sql`true`.as<boolean>(), // boolean
	col7: sql`random()`.as<number>(), // number
	col8: sql`some_funky_func(${users.id})`.as(mapFunkyFuncResult), // { foo: string }
	col9: sql`greatest(${users.createdAt}, ${param(new Date(), users.createdAt)})`, // unknown
	col10: sql`date_or_false(${users.createdAt}, ${param(new Date(), users.createdAt)})`.as<Date | boolean>(), // Date | boolean
	col11: sql`${users.age1} + ${age}`, // unknown
	col12: sql`${users.age1} + ${param(age, users.age1)}`, // unknown
	col13: sql`lower(${users.class})`, // unknown
	col14: sql`length(${users.class})`.as<number>(), // number
	count: sql`count(*)`.as<number>(), // number
}).where(and(
	eq(users.id, 1),
	ne(users.id, 1),
	or(eq(users.id, 1), ne(users.id, 1)),
	not(eq(users.id, 1)),
	gt(users.id, 1),
	gte(users.id, 1),
	lt(users.id, 1),
	lte(users.id, 1),
	inArray(users.id, [1, 2, 3]),
	inArray(users.id, db.select(users).fields({ id: users.id })),
	inArray(users.id, sql`select id from ${users}`),
	notInArray(users.id, [1, 2, 3]),
	notInArray(users.id, db.select(users).fields({ id: users.id })),
	notInArray(users.id, sql`select id from ${users}`),
	isNull(users.subClass),
	isNotNull(users.id),
	exists(db.select(users).fields({ id: users.id })),
	exists(sql`select id from ${users}`),
	notExists(db.select(users).fields({ id: users.id })),
	notExists(sql`select id from ${users}`),
	between(users.id, 1, 2),
	notBetween(users.id, 1, 2),
	like(users.id, '%1%'),
	notLike(users.id, '%1%'),
	ilike(users.id, '%1%'),
	notIlike(users.id, '%1%'),
));

Expect<
	Equal<{
		col2: unknown;
		col3: number;
		col33: number;
		col34: { foo: any };
		col4: string | number;
		col5: unknown;
		col6: boolean;
		col7: number;
		col8: {
			foo: any;
		};
		col9: unknown;
		col10: boolean | Date;
		col11: unknown;
		col12: unknown;
		col13: unknown;
		col14: number;
		count: number;
	}[], typeof allOperators>
>;

const textSelect = await db.select(users).fields({
	t: users.text,
});

Expect<Equal<{ t: string | null }[], typeof textSelect>>;

const homeCity = alias(cities, 'homeCity');
const c = alias(classes, 'c');
const otherClass = alias(classes, 'otherClass');
const anotherClass = alias(classes, 'anotherClass');
const friend = alias(users, 'friend');
const currentCity = alias(cities, 'currentCity');
const subscriber = alias(users, 'subscriber');
const closestCity = alias(cities, 'closestCity');
const closestCity2 = alias(cities, 'closestCity2');
const closestCity3 = alias(cities, 'closestCity3');
const closestCity4 = alias(cities, 'closestCity4');
const closestCity5 = alias(cities, 'closestCity5');
const closestCity6 = alias(cities, 'closestCity6');
const closestCity7 = alias(cities, 'closestCity7');

const megaJoin = await db.select(users)
	.fields({
		user: {
			id: users.id,
			maxAge: sql`max(${users.age1})`,
		},
		city: {
			id: cities.id,
		},
		homeCity,
		c,
		otherClass,
		anotherClass,
		friend,
		currentCity,
		subscriber,
		closestCity,
	})
	.innerJoin(cities, sql`${users.id} = ${cities.id}`)
	.innerJoin(homeCity, sql`${users.homeCity} = ${homeCity.id}`)
	.innerJoin(c, eq(c.id, users.class))
	.innerJoin(otherClass, sql`${c.id} = ${otherClass.id}`)
	.innerJoin(anotherClass, sql`${users.class} = ${anotherClass.id}`)
	.innerJoin(friend, sql`${users.id} = ${friend.id}`)
	.innerJoin(currentCity, sql`${homeCity.id} = ${currentCity.id}`)
	.innerJoin(subscriber, sql`${users.class} = ${subscriber.id}`)
	.innerJoin(closestCity, sql`${users.currentCity} = ${closestCity.id}`)
	.where(and(sql`${users.age1} > 0`, eq(cities.id, 1)))
	.limit(1)
	.offset(1);

Expect<
	Equal<
		{
			user: {
				id: number;
				maxAge: unknown;
			};
			city: {
				id: number;
			};
			homeCity: {
				id: number;
				name: string;
				population: number | null;
			};
			c: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			otherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			anotherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			};
			friend: {
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
			};
			currentCity: {
				id: number;
				name: string;
				population: number | null;
			};
			subscriber: {
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
			};
			closestCity: {
				id: number;
				name: string;
				population: number | null;
			};
		}[],
		typeof megaJoin
	>
>;

const megaLeftJoin = await db.select(users)
	.fields({
		user: {
			id: users.id,
			maxAge: sql`max(${users.age1})`,
		},
		city: {
			id: cities.id,
		},
		homeCity,
		c,
		otherClass,
		anotherClass,
		friend,
		currentCity,
		subscriber,
		closestCity,
		closestCity2,
		closestCity3,
		closestCity4,
		closestCity5,
		closestCity6,
		closestCity7,
	})
	.leftJoin(cities, sql`${users.id} = ${cities.id}`)
	.leftJoin(homeCity, sql`${users.homeCity} = ${homeCity.id}`)
	.leftJoin(c, eq(c.id, users.class))
	.leftJoin(otherClass, sql`${c.id} = ${otherClass.id}`)
	.leftJoin(anotherClass, sql`${users.class} = ${anotherClass.id}`)
	.leftJoin(friend, sql`${users.id} = ${friend.id}`)
	.leftJoin(currentCity, sql`${homeCity.id} = ${currentCity.id}`)
	.leftJoin(subscriber, sql`${users.class} = ${subscriber.id}`)
	.leftJoin(closestCity, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity2, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity3, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity4, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity5, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity6, sql`${users.currentCity} = ${closestCity.id}`)
	.leftJoin(closestCity7, sql`${users.currentCity} = ${closestCity.id}`)
	.where(and(sql`${users.age1} > 0`, eq(cities.id, 1)))
	.limit(1)
	.offset(1);

Expect<
	Equal<
		{
			user: {
				id: number;
				maxAge: unknown;
			};
			city: {
				id: number;
			} | null;
			homeCity: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			c: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			} | null;
			otherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			} | null;
			anotherClass: {
				id: number;
				class: 'A' | 'C' | null;
				subClass: 'B' | 'D';
			} | null;
			friend: {
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
			currentCity: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			subscriber: {
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
			closestCity: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity2: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity3: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity4: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity5: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity6: {
				id: number;
				name: string;
				population: number | null;
			} | null;
			closestCity7: {
				id: number;
				name: string;
				population: number | null;
			} | null;
		}[],
		typeof megaLeftJoin
	>
>;

const megaFullJoin = await db.select(users)
	.fields({
		user: {
			id: users.id,
			maxAge: sql`max(${users.age1})`,
		},
		city: {
			id: cities.id,
		},
		homeCity,
		c,
		otherClass,
		anotherClass,
		friend,
		currentCity,
		subscriber,
		closestCity,
		closestCity2,
		closestCity3,
		closestCity4,
		closestCity5,
		closestCity6,
		closestCity7,
	})
	.fullJoin(cities, sql`${users.id} = ${cities.id}`)
	.fullJoin(homeCity, sql`${users.homeCity} = ${homeCity.id}`)
	.fullJoin(c, eq(c.id, users.class))
	.fullJoin(otherClass, sql`${c.id} = ${otherClass.id}`)
	.fullJoin(anotherClass, sql`${users.class} = ${anotherClass.id}`)
	.fullJoin(friend, sql`${users.id} = ${friend.id}`)
	.fullJoin(currentCity, sql`${homeCity.id} = ${currentCity.id}`)
	.fullJoin(subscriber, sql`${users.class} = ${subscriber.id}`)
	.fullJoin(closestCity, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity2, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity3, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity4, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity5, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity6, sql`${users.currentCity} = ${closestCity.id}`)
	.fullJoin(closestCity7, sql`${users.currentCity} = ${closestCity.id}`)
	.where(and(sql`${users.age1} > 0`, eq(cities.id, 1)))
	.limit(1)
	.offset(1);

const friends = alias(users, 'friends');

const join4 = await db.select(users)
	.fields({
		user: {
			id: users.id,
		},
		city: {
			id: cities.id,
		},
		class: classes,
		friend: friends,
	})
	.innerJoin(cities, sql`${users.id} = ${cities.id}`)
	.innerJoin(classes, sql`${cities.id} = ${classes.id}`)
	.innerJoin(friends, sql`${friends.id} = ${users.id}`)
	.where(sql`${users.age1} > 0`);

Expect<
	Equal<{
		user: {
			id: number;
		};
		city: {
			id: number;
		};
		class: {
			id: number;
			class: 'A' | 'C' | null;
			subClass: 'B' | 'D';
		};
		friend: {
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
		};
	}[], typeof join4>
>;
