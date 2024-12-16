import type { HTTPQueryOptions } from '@neondatabase/serverless';
import { type Equal, Expect } from 'type-tests/utils.ts';
import type { NeonAuthToken } from '~/utils';

Expect<Equal<Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>, NeonAuthToken>>;
