// import { bigint } from './bigint.ts';
import { boolean } from './boolean.ts';
import { bytes } from './bytes.ts';
import { string } from './string.ts';
// import { customType } from './custom.ts';
import { date } from './date.ts';
import { float32 } from './float32.ts';
import { float64 } from './float64.ts';
import { int64 } from './int64.ts';
import { json } from './json.ts';
import { numeric } from './numeric.ts';
import { timestamp } from './timestamp.ts';

export function getGoogleSqlColumnBuilders() {
	return {
		bytes,
		boolean,
		string,
		date,
		numeric,
		float32,
		float64,
		int64,
		json,
		timestamp,
		// TODO: suppport for more types:
		// array,
		// proto,
		// customType,
	};
}

export type GoogleSqlColumnBuilders = ReturnType<typeof getGoogleSqlColumnBuilders>;
