import { tests } from './common';
import { tests as cacheTests } from './common-cache';
import { singleStoreTest } from './instrumentation';

cacheTests(singleStoreTest);
tests(singleStoreTest);
