import { array } from './array.ts';
import { int128, int256, int64, uint128, uint256, uint64 } from './bigint.ts';
import { bool, boolean } from './bool.ts';
import { customType } from './custom.ts';
import { date, date32 } from './date.ts';
import { dateTime, dateTime64 } from './datetime.ts';
import { decimal, decimal128, decimal256, decimal32, decimal64 } from './decimal.ts';
import { enum16, enum8 } from './enum.ts';
import { float32, float64 } from './float.ts';
import { int16, int32, int8, uint16, uint32, uint8 } from './int.ts';
import { ipv4, ipv6 } from './ip.ts';
import { json } from './json.ts';
import { lowCardinality } from './low-cardinality.ts';
import { map } from './map.ts';
import { nullable } from './nullable.ts';
import { fixedString, string } from './string.ts';
import { tuple } from './tuple.ts';
import { uuid } from './uuid.ts';

export function getClickHouseColumnBuilders() {
	return {
		array,
		bool,
		boolean,
		customType,
		date,
		date32,
		dateTime,
		dateTime64,
		decimal,
		decimal32,
		decimal64,
		decimal128,
		decimal256,
		enum8,
		enum16,
		fixedString,
		float32,
		float64,
		int8,
		int16,
		int32,
		int64,
		int128,
		int256,
		ipv4,
		ipv6,
		json,
		lowCardinality,
		map,
		nullable,
		string,
		tuple,
		uint8,
		uint16,
		uint32,
		uint64,
		uint128,
		uint256,
		uuid,
	};
}

export type ClickHouseColumnBuilders = ReturnType<typeof getClickHouseColumnBuilders>;
