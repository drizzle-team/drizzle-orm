import { parseEnum,Decimal } from 'src/dialects/mysql/grammar';
import { expect, test } from 'vitest';

test('enum', () => {
	expect(parseEnum("enum('one','two','three')")).toStrictEqual(['one', 'two', 'three']);
});

test("numeric|decimal",()=>{
	expect.soft(Decimal.is("decimal")).true
	expect.soft(Decimal.is("numeric")).true
	expect.soft(Decimal.is("decimal(7)")).true
	expect.soft(Decimal.is("numeric(7)")).true
	expect.soft(Decimal.is("decimal (7)")).true
	expect.soft(Decimal.is("numeric (7)")).true
	expect.soft(Decimal.is("decimal(7, 4)")).true
	expect.soft(Decimal.is("decimal(7, 0)")).true
	expect.soft(Decimal.is("decimal(7, 0) ZEROFILL")).true
	expect.soft(Decimal.is("decimal(7, 0) unsigned")).true
	expect.soft(Decimal.is("DECIMAL(7, 0) UNSIGNED")).true
	expect.soft(Decimal.is("DECIMAL(7, 0) UNSIGNED ZEROFILL")).true
})