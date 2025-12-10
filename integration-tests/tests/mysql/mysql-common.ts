/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';

import type { Test } from './instrumentation';
import { tests as tests1 } from './mysql-common-1';
import { tests as tests2 } from './mysql-common-2';
import { tests as tests3 } from './mysql-common-3';
import { tests as tests4 } from './mysql-common-4';
import { tests as tests5 } from './mysql-common-5';
import { tests as tests6 } from './mysql-common-6';
import { tests as tests7 } from './mysql-common-7';
import { tests as tests8 } from './mysql-common-8';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	tests1(test, exclude);
	tests2(test, exclude);
	tests3(test, exclude);
	tests4(test, exclude);
	tests5(test, exclude);
	tests6(test, exclude);
	tests7(test, exclude);
	tests8(test, exclude);
}
