import { and, or, type SQL } from 'drizzle-orm';

declare function returnsMaybeSql(): SQL | undefined;
declare function returnsSql(): SQL;

void function testConditionTypes() {
	// @ts-expect-error it will return undefined
	and() satisfies SQL;
	// @ts-expect-error it could return undefined
	and(returnsMaybeSql()) satisfies SQL;
	// @ts-expect-error the SQL could return null
	and(returnsSql()) satisfies SQL<boolean>;
	// this should be ok
	and(returnsSql()) satisfies SQL<boolean | null>;
	and(returnsSql(), undefined) satisfies SQL<boolean | null>;

	// @ts-expect-error it will return undefined
	or() satisfies SQL;
	// @ts-expect-error it could return undefined
	or(returnsMaybeSql()) satisfies SQL;
	// @ts-expect-error the SQL could return null
	or(returnsSql()) satisfies SQL<boolean>;
	// this should be ok
	or(returnsSql()) satisfies SQL<boolean | null>;
	or(returnsSql(), undefined) satisfies SQL<boolean | null>;
};
