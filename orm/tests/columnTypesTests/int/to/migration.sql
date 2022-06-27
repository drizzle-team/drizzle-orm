CREATE TABLE IF NOT EXISTS table_with_all_ints (
	"primary_key" INT PRIMARY KEY,
	"serial_int" SERIAL,
	"simple_int" INT,
	"not_null_int" INT NOT NULL,
	"int_with_default" INT DEFAULT 1,
	"not_null_int_with_default" INT DEFAULT 1 NOT NULL,
	"unique_int" INT,
	"not_null_unique_int" INT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS table_with_all_ints_unique_int_index ON table_with_all_ints ("unique_int");
CREATE UNIQUE INDEX IF NOT EXISTS table_with_all_ints_not_null_unique_int_index ON table_with_all_ints ("not_null_unique_int");
CREATE UNIQUE INDEX IF NOT EXISTS table_with_all_ints_simple_int_index ON table_with_all_ints ("simple_int");
CREATE INDEX IF NOT EXISTS table_with_all_ints_int_with_default_index ON table_with_all_ints ("int_with_default");