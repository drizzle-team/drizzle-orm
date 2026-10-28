import { expect } from 'vitest';

// The database sets the time when the statement runs. Concurrent tests can delay that statement, so the
// time must lie between `since` and now. The margin allows for clocks that differ between the test process
// and the database.
export const expectRecentTime = (value: Date, since: number, margin = 300) => {
	expect(value.getTime()).toBeGreaterThanOrEqual(since - margin);
	expect(value.getTime()).toBeLessThanOrEqual(Date.now() + margin);
};
