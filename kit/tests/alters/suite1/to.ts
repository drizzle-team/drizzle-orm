import { AbstractTable } from 'drizzle-orm';

export default class AuthOtpTable extends AbstractTable<AuthOtpTable> {
    public id = this.serial('id').primaryKey();
    public phone = this.text('phone1').notNull().defaultValue('phoniren');
    public column1 = this.varchar('to_add_default', { size: 256 });
    public column2 = this.varchar('to_add_notnull', { size: 256 }).notNull();
    public column3 = this.varchar('to_change_default', { size: 256 }).defaultValue('defaultToChange');
    public column4 = this.varchar('to_drop_default', { size: 256 });
    public column5 = this.varchar('to_drop_notnull', { size: 256 });

    public tableName(): string {
        return 'auth_otp1';
    }
}
