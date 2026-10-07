-- Backfill rollover links for Rocks carried forward BEFORE rolledFromId
-- existed. A pre-existing copy is recognised as: same Company, same Title,
-- same Business Goal, in the very next quarter (Q4 -> Q1 of the next Year
-- included), created after the original, and the original isn't
-- TARGET_MET. If a quarter was rolled over more than once, only the
-- earliest copy gets linked — any extra duplicate copies are left as-is
-- (not deleted) for a person to review and remove.
WITH rq AS (
  SELECT r."id", r."companyId", r."title", r."businessGoalId", r."status", r."createdAt",
         (y."year" * 4 + r."quarter") AS qidx
  FROM "Rock" r
  JOIN "Year" y ON y."id" = r."yearId"
),
pairs AS (
  SELECT DISTINCT ON (src."id") src."id" AS src_id, cp."id" AS copy_id
  FROM rq src
  JOIN rq cp
    ON cp."companyId" = src."companyId"
   AND cp."title" = src."title"
   AND cp."businessGoalId" IS NOT DISTINCT FROM src."businessGoalId"
   AND cp.qidx = src.qidx + 1
   AND cp."createdAt" > src."createdAt"
  WHERE src."status" <> 'TARGET_MET'
  ORDER BY src."id", cp."createdAt" ASC
),
uniq AS (
  SELECT DISTINCT ON (copy_id) src_id, copy_id
  FROM pairs
  ORDER BY copy_id, src_id
)
UPDATE "Rock" c
SET "rolledFromId" = u.src_id
FROM uniq u
WHERE c."id" = u.copy_id
  AND c."rolledFromId" IS NULL;

UPDATE "Rock"
SET "status" = 'ROLLED_OVER'
WHERE "id" IN (SELECT "rolledFromId" FROM "Rock" WHERE "rolledFromId" IS NOT NULL);
