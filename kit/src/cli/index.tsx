#!/usr/bin/env node
import { Command, program } from 'commander';
import { prepareAndMigrate } from './commands/migrate';
import 'source-map-support/register';
import 'pretty-error/start';
import './commands/migrate';

const migrationCommand = new Command('migrate')
    .alias('mg')
    .description('Migration')
    .action(prepareAndMigrate);

program.addCommand(migrationCommand)
program.parse();
