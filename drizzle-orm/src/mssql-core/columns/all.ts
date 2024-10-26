import { bigint } from './bigint.ts';
import { binary } from './binary.ts';
import { bit } from './bit.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { datetime } from './datetime.ts';
import { datetime2 } from './datetime2.ts';
import { datetimeoffset } from './datetimeoffset.ts';
import { decimal } from './decimal.ts';
import { float } from './float.ts';
import { int } from './int.ts';
import { mediumint } from './mediumint.ts';
import { numeric } from './numeric.ts';
import { real } from './real.ts';
import { smalldate } from './smalldate.ts';
import { smallint } from './smallint.ts';
import { text } from './text.ts';
import { time } from './time.ts';
import { tinyint } from './tinyint.ts';
import { varbinary } from './varbinary.ts';
import { varchar } from './varchar.ts';

export function getMsSqlColumnBuilders() {
	return {
		bigint,
		binary,
		bit,
		char,
		customType,
		date,
		datetime,
		datetime2,
		datetimeoffset,
		decimal,
		float,
		int,
		mediumint,
		real,
		numeric,
		smalldate,
		smallint,
		text,
		time,
		tinyint,
		varbinary,
		varchar,
	};
}

export type MsSqlColumnBuilders = ReturnType<typeof getMsSqlColumnBuilders>;
