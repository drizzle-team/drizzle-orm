CREATE TABLE [cities_migration] (
	[id] int,
	[fullname_name] text,
	[state] text
);

--> statement-breakpoint
CREATE TABLE [users_migration] (
	[id] int PRIMARY KEY NOT NULL,
	[full_name] text,
	[phone] int,
	[invited_by] int,
	[city_id] int,
	[date] timestamp
);

--> statement-breakpoint
CREATE TABLE [users12] (
	[id] int identity PRIMARY KEY NOT NULL,
	[name] text NOT NULL,
	[email] text NOT NULL
);