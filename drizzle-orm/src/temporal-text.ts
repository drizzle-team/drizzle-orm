import { DrizzleError } from '~/errors.ts';

// Date and time values as PostgreSQL and CockroachDB write them in ISO `DateStyle`, to `Date`

const temporalTextRe =
	/^(\d{4,})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d):(\d\d)(?:\.(\d+))?)?(?:([+-])(\d\d)(?::(\d\d))?(?::(\d\d))?)?( BC)?$/;

const parseTemporalText = (v: string): Date => {
	const m = temporalTextRe.exec(v);
	if (m === null) {
		if (v === 'infinity' || v === '-infinity') return new Date(Number.NaN);
		throw new DrizzleError({
			message:
				`Unable to decode date/time value "${v}": only ISO output is supported, set the session's \`DateStyle\` to \`ISO\``,
		});
	}

	const year = m[12] === undefined ? +m[1]! : 1 - +m[1]!;
	const fraction = m[7];
	const ms = fraction === undefined ? 0 : +(fraction.length >= 3 ? fraction.slice(0, 3) : fraction.padEnd(3, '0'));
	const timeless = m[4] === undefined;

	const sign = m[8] === '-' ? -1 : 1;
	const offsetH = m[8] === undefined ? 0 : sign * +m[9]!;
	const offsetM = m[10] === undefined ? 0 : sign * +m[10];
	const offsetS = m[11] === undefined ? 0 : sign * +m[11];
	// `Date.UTC` maps years 0 - 99 to 1900 - 1999 - those are computed 400 years (146097 days) later
	const shift = year >= 0 && year <= 99 ? 400 : 0;
	const time = Date.UTC(
		year + shift,
		+m[2]! - 1,
		+m[3]!,
		(timeless ? 0 : +m[4]!) - offsetH,
		(timeless ? 0 : +m[5]!) - offsetM,
		(timeless ? 0 : +m[6]!) - offsetS,
		ms,
	);

	return new Date(shift === 0 ? time : time - 146097 * 86400000);
};

const isEngineParsable = (v: string): boolean => {
	const first = v.charCodeAt(0);
	if (first < 49 || first > 57 || v.charCodeAt(4) !== 45) return false;
	if (v.charCodeAt(v.length - 1) === 67) return false;
	const offsetSign = v.charCodeAt(v.length - 9);
	return offsetSign !== 43 && offsetSign !== 45;
};

export const textToDate = (v: string): Date => isEngineParsable(v) ? new Date(v) : parseTemporalText(v);
export const textToDateWithTz = (v: string): Date => isEngineParsable(v) ? new Date(v + '+0000') : parseTemporalText(v);
