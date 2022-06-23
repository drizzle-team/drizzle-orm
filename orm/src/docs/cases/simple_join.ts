/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Create, DbConnector } from '../..';
import { eq } from '../../builders';
import ConsoleLogger from '../../logger/consoleLogger';
import { ExtractModel } from '../../tables/inferTypes';
import CitiesTable from '../tables/citiesTable';
import UserGroupsTable from '../tables/userGroupsTable';
import UsersTable from '../tables/usersTable';
import UsersToUserGroupsTable from '../tables/usersToUserGroups';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/migrator')
      .connect();

    db.useLogger(new ConsoleLogger());

    const usersTable = new UsersTable(db);
    const citiesTable = new CitiesTable(db);
    const usersToUserGroupsTable = new UsersToUserGroupsTable(db);
    const userGroupsTable = new UserGroupsTable(db);

    // await db.session().execute(Create.table(usersTable).build());
    // await db.session().execute(Create.table(citiesTable).build());
    // await db.session().execute(Create.table(userGroupsTable).build());
    // await db.session().execute(Create.table(usersToUserGroupsTable).build());

    const userRes = await usersTable.insertMany([{
      decimalField: 4.2,
      createdAt: new Date(),
      role: 'foo',
    }, {
      decimalField: 5.8,
      createdAt: new Date(),
      role: 'foo',
    }]).all();

    const citiesRes = await citiesTable.insertMany([{
      foundationDate: new Date(),
      userId: userRes[0]?.id!,
    }, {
      foundationDate: new Date(),
      userId: userRes[1]?.id!,
    }]).all();

    const userGroups = await userGroupsTable.insertMany([{
      name: 'firstGroup',
    }, {
      name: 'secondGroup',
    }]).all();

    await usersToUserGroupsTable.insertMany([{
      userId: userRes[0]?.id!,
      groupId: userGroups[0]?.id!,
    },
    {
      userId: userRes[1]?.id!,
      groupId: userGroups[1]?.id!,
    }]).execute();

    // map case
    const userWithCities = await citiesTable.select({ id: citiesTable.userId })
      .where(eq(citiesTable.id, 1))
      .innerJoinV1(UsersTable,
        (city) => city.userId,
        (users) => users.id)
      .execute();

    const citiesWithUserObject = userWithCities.map((city, user) => ({ city: city.id, user }));

    // foreach case
    // const userWithCities1 = await citiesTable.select()
    //   .where(eq(citiesTable.id, 1))
    //   .leftJoin(UsersTable,
    //     (city) => city.userId,
    //     (users) => users.id)
    //   .execute();

    // let user;
    // const cities = [];

    // userWithCities.foreach((dbCity, dbUser) => {
    //   cities.push(dbCity);
    //   user = dbUser;
    // });

    // const usersTable = new UsersTable(db);
    // const citiesTable = new CitiesTable(db);

    const sdf = await citiesTable.select({
      id: citiesTable.id,
      userId: citiesTable.userId,
    }).where(eq(citiesTable.id, 1))
      .leftJoinV1(UsersTable,
        (city) => city.userId,
        (users) => users.id,
        {
          id: usersTable.id,
        })
      .execute();

    // group case
    const usersWithUserGroups = await usersToUserGroupsTable.select()
      .where(eq(userGroupsTable.id, 1))
      .leftJoinV1(UsersTable,
        (userToGroup) => userToGroup.userId,
        (users) => users.id,
        {
          id: usersTable.id,
        })
      .leftJoin(UsersToUserGroupsTable, UserGroupsTable,
        (userToGroup) => userToGroup.groupId,
        (userGroup) => userGroup.id,
        {
          id: userGroupsTable.id,
        })
      .execute();

    const userGroupWithUsers = usersWithUserGroups.group({
      one: (_, dbUser, dbUserGroup) => dbUser!,
      many: (_, dbUser, dbUserGroup) => dbUserGroup!,
    });

    // const userWithGroups: ExtractModel<UsersTable> & { groups: ExtractModel<UserGroupsTable>[] } = {
    //   ...userGroupWithUsers.one,
    //   groups: userGroupWithUsers.many,
    // };

    // console.log('city', city!);
    // console.log('cityUsers', cityUsers);
    // console.log('cityWithUsers', forEachCities);
    // console.log('cityWithUsers1', forEachUsers);

    // how to handle many-to-many relations
  } catch (e) {
    console.log(e);
  }
})();
