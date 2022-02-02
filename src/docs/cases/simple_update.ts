/* eslint-disable @typescript-eslint/no-unused-vars */
import { DbConnector } from '../..';
import { eq } from '../../builders';
import ConsoleLogger from '../../logger/consoleLogger';
import CitiesTable from '../tables/citiesTable';
import UserGroupsTable from '../tables/userGroupsTable';
import UsersTable from '../tables/usersTable';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/migrator')
      .connect();

    db.useLogger(new ConsoleLogger());

    const usersTable = new UsersTable(db);
    const citiesTable = new CitiesTable(db);
    const userGroupsTable = new UserGroupsTable(db);

    await usersTable.update()
      .where(eq(usersTable.phone, 'hello'))
      .set({ fullName: 'newName' })
      .execute();

    const updatedCities = await citiesTable.update()
      .where(eq(citiesTable.location, 'USA'))
      .set({ metadata: { population: 1, connection: 'first' } })
      .all();

    const updatedUserGroup = await userGroupsTable.update()
      .where(eq(userGroupsTable.id, 1))
      .set({ description: 'updated description' })
      .all();
  } catch (e) {
    console.log(e);
  }
})();
