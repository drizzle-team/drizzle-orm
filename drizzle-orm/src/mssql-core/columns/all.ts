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
import { json } from './json.ts';
import { money, smallmoney } from './money.ts';
import { numeric } from './numeric.ts';
import { real } from './real.ts';
import { rowversion } from './rowversion.ts';
import { smalldatetime } from './smalldatetime.ts';
import { smallint } from './smallint.ts';
import { geography, geometry } from './spatial.ts';
import { ntext, text } from './text.ts';
import { time } from './time.ts';
import { tinyint } from './tinyint.ts';
import { uniqueidentifier } from './uniqueidentifier.ts';
import { varbinary } from './varbinary.ts';
import { nvarchar, varchar } from './varchar.ts';
import { xml } from './xml.ts';

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
		geography,
		geometry,
		int,
		json,
		money,
		real,
		numeric,
		rowversion,
		smallint,
		smalldatetime,
		smallmoney,
		text,
		ntext,
		time,
		tinyint,
		uniqueidentifier,
		varbinary,
		varchar,
		nvarchar,
		xml,
	};
}

export type MsSqlColumnBuilders = ReturnType<typeof getMsSqlColumnBuilders>;
