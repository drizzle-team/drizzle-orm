/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';

import { type Test } from './instrumentation';
import { tests as tests1 } from './mysql-common-1';
import { tests as tests2 } from './mysql-common-2';
import { tests as tests3 } from './mysql-common-3';
import { tests as tests4 } from './mysql-common-4';
import { tests as tests5 } from './mysql-common-5';
import { tests as tests6 } from './mysql-common-6';
import { tests as tests7 } from './mysql-common-7';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	// tests1(vendor, test, exclude);
	// tests2(vendor, test, exclude);
	// tests3(vendor, test, exclude);
	// tests4(vendor, test, exclude);
	// tests5(vendor, test, exclude);
	tests6(vendor, test, exclude);
	// tests7(vendor, test, exclude);
}
