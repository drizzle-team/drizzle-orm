import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/index.ts';
import type { CockroachTable } from './table.ts';

export class CheckBuilder {
	static readonly [entityKind]: string = 'CockroachCheckBuilder';

	protected brand!: 'CockroachConstraintBuilder';

	constructor(public name: string, public value: SQL) {}

	/** @internal */
	build(table: CockroachTable): Check {
		return new Check(table, this);
	}
}

export class Check {
	static readonly [entityKind]: string = 'CockroachCheck';

	readonly name: string;
	readonly value: SQL;

	constructor(public table: CockroachTable, builder: CheckBuilder) {
		this.name = builder.name;
		this.value = builder.value;
	}
}

export function check(name: string, value: SQL): CheckBuilder {
	return new CheckBuilder(name, value);
}
