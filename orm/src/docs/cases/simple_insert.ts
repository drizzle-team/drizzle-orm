/* eslint-disable @typescript-eslint/no-unused-vars */
import Create from '../../builders/lowLvlBuilders/create';
import DbConnector from '../../db/dbConnector';
import ConsoleLogger from '../../logger/consoleLogger';
import CitiesTable from '../tables/citiesTable';
import UserGroupsTable from '../tables/userGroupsTable';
import UsersTable from '../tables/usersTable';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/migrator')
      .connect();

    const usersTable = new UsersTable(db);
    const citiesTable = new CitiesTable(db);
    const userGroupsTable = new UserGroupsTable(db);

    // await db.session().execute(Create.table(usersTable).build());
    // await db.session().execute(Create.table(citiesTable).build());
    // await db.session().execute(Create.table(userGroupsTable).build());

    db.useLogger(new ConsoleLogger());

    await usersTable.insert({
      decimalField: 12.4,
      createdAt: new Date(),
      role: 'foo',
    }).execute();

    const insertedCities = await citiesTable.insert({
      foundationDate: new Date(),
    }).all();

    const insertedUserGroup = await userGroupsTable.insert({
      name: 'firstGroup',
    }).findOne();

    const manyInsertedCities = await citiesTable.insertMany([{
      foundationDate: new Date(),
      location: 'USA',
    }, {
      foundationDate: new Date(),
      location: 'USA',
      userId: 2,
    }]).all();

    const conflictInsertedUsers = await usersTable.insertMany([{
      decimalField: 12.4,
      createdAt: new Date(),
      role: 'foo',
    }, {
      decimalField: 32.4,
      createdAt: new Date(),
      role: 'foo',
      phone: '+1808',
    }])
      .onConflict(
        (table) => table.phoneIndex,
        { isArchived: true },
      ).all();
  } catch (e) {
    console.log(e);
  }
})();
