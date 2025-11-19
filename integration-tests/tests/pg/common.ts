/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';

import { tests as tests4 } from './common-cache';
import { tests as tests1 } from './common-pt1';
import { tests as tests2 } from './common-pt2';
import { tests as tests3 } from './common-rqb';
import type { Test } from './instrumentation';

export function tests(test: Test, exclude: string[]) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.includes(task.name)) skip();
	});

	tests1(test);
	tests2(test);
	tests3(test);
	tests4(test);
}
