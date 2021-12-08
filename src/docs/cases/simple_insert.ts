/* eslint-disable @typescript-eslint/no-unused-vars */
import { Create, DbConnector } from '../..';
import { ExtractModel } from '../../tables/inferTypes';
import CitiesTable from '../tables/citiesTable';
import UserGroupsTable from '../tables/userGroupsTable';
import UsersTable from '../tables/usersTable';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/drizzle-docs')
      .connect();

    const usersTable = new UsersTable(db);
    const citiesTable = new CitiesTable(db);
    const userGroupsTable = new UserGroupsTable(db);

    await db.session().execute(Create.table(usersTable).build());

    await usersTable.insert({
      decimalField: 12.4,
      createdAt: new Date(),
      role: 'guest',
    }).execute();

    const insertedCities = await citiesTable.insert({
      foundationDate: new Date(),
    }).all();

    const insertedUserGroup = await userGroupsTable.insert({
      name: 'firstGroup',
    }).first();

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
      role: 'guest',
    }, {
      decimalField: 32.4,
      createdAt: new Date(),
      role: 'admin',
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
