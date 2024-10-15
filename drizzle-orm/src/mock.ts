import { entityKind } from './entity.ts';

export class MockDriver {
	/** @internal */
	static readonly [entityKind] = 'MockDriver';
}

export const mock = new MockDriver();
