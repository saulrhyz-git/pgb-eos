-- Allow creating Users with no base Role ("blank"), relying entirely on an
-- assigned Custom Role for access.
ALTER TABLE "User" ALTER COLUMN "role" DROP NOT NULL;
