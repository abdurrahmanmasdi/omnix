CREATE TYPE "UserLocale" AS ENUM ('EN', 'TR', 'AR');
ALTER TABLE "users" ADD COLUMN "locale" "UserLocale";
