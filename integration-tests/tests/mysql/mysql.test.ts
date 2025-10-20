import { mysqlTest } from './instrumentation';
import { runTests } from './mysql-common-cache';
import { tests } from './mysql-common';

runTests('mysql', mysqlTest);
tests("mysql", mysqlTest)
