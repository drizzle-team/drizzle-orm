import { bool } from './bool.ts';
import { bytes } from './bytes.ts';
import { date } from './date.ts';
import { datetime } from './datetime.ts';
import { float64 } from './float64.ts';
import { int64 } from './int64.ts';
import { json } from './json.ts';
import { bignumeric, numeric } from './numeric.ts';
import { string } from './string.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';

export function getBigQueryColumnBuilders() {
	return {
		bool,
		bytes,
		date,
		datetime,
		float64,
		int64,
		json,
		numeric,
		bignumeric,
		string,
		time,
		timestamp,
	};
}

export type BigQueryColumnBuilders = ReturnType<typeof getBigQueryColumnBuilders>;
