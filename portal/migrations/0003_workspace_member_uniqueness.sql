-- Preflight duplicate principals before creating the index required by invitation redemption.
-- A duplicate makes CREATE UNIQUE INDEX fail. No membership or role is deleted or chosen for you.
SELECT workspace_id, user_id, count(*) AS membership_count
FROM workspace_member
GROUP BY workspace_id, user_id
HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_member_workspace_user_idx"
ON "workspace_member" ("workspace_id", "user_id");
