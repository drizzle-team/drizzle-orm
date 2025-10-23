import { mysqlTest } from '../instrumentation';
import { tests } from '../mysql-common';
import { runTests } from '../mysql-common-cache';

runTests('mysql', mysqlTest);
tests(mysqlTest);
