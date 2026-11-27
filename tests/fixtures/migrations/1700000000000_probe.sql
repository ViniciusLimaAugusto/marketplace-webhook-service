-- Up Migration
CREATE TABLE migration_probe (id integer PRIMARY KEY);

-- Down Migration
DROP TABLE migration_probe;
