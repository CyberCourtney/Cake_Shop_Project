# Backup and disaster recovery

> **Status:** written in Phase 2. These procedures are **not yet rehearsed**. A restore
> rehearsal in dev is part of Phase 5. Until then, treat the steps as a plan.

## What protects the data

| Protection | Where | Effect |
|---|---|---|
| Point-in-time recovery (PITR), 35 days | DynamoDB table | Restore to any second in the last 35 days, into a **new** table |
| `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` | Table, user pool | A stack delete or a replacing update never deletes them |
| Deletion protection (prod) | Table, user pool | Even a direct API delete fails until protection is turned off |
| Change-set review in `deploy.sh` | All stacks | Replacements are shown before anything runs |
| On-demand backup before prod teardown | `destroy.sh` | A named backup that is kept until it is deleted |
| S3 versioning (30 days of old versions) | Site and artifacts buckets | Roll back a bad frontend upload |
| Everything else in git | Repository | Infrastructure and code can be rebuilt from scratch |

**Recovery targets:**

| Measure | Target | Meaning |
|---|---|---|
| RPO (data loss) | About 5 minutes | How far back PITR can be behind |
| RTO (time to recover) | Under 1 hour for a table restore. About 30 minutes for a full redeploy. | How long recovery takes |

## Scenarios

### A. An order or product was changed or deleted by mistake
1. Find the time just before the mistake (from order history events or CloudWatch logs).
2. Restore into a temporary table:
   ```bash
   aws dynamodb restore-table-to-point-in-time --region eu-west-2 \
     --source-table-name kvc-prod-main --target-table-name kvc-prod-restore-tmp \
     --restore-date-time 2026-12-20T09:15:00Z
   ```
3. Copy the affected item back:
   ```bash
   aws dynamodb get-item --region eu-west-2 --table-name kvc-prod-restore-tmp \
     --key '{"pk":{"S":"ORDER#KV-7K3QXM"},"sk":{"S":"META"}}' > item.json
   aws dynamodb put-item ...
   ```
   Do this carefully: you are overwriting live data.
4. Delete the temporary table. Restored tables are billed like any other table.

### B. The whole table is lost or corrupted
1. Restore with PITR (or from the latest on-demand backup) to `kvc-prod-main-restored`.
2. Bring it under CloudFormation by renaming. CloudFormation cannot adopt a table with a
   different name in place. The cleanest route is:
   - Delete the broken table, or rename the environment's table through a **resource
     import**. To import: remove the table from the template with `DeletionPolicy: Retain`
     and update the stack. Then add it back with the restored table's name, and run
     `create-change-set --change-set-type IMPORT`.
   - The exact template change will be scripted and rehearsed in Phase 5.
3. Re-enable PITR, deletion protection and TTL on the restored table. Restores do not copy
   all of these settings.
4. Update the stream event source mapping. A restored table has a **new stream ARN**, which
   the import above resolves.

### C. A bad frontend deploy
Republish the previous git tag with `scripts/publish-frontend.sh` (Phase 3), or restore the
previous object versions in S3, then invalidate CloudFront.

### D. A bad infrastructure deploy
CloudFormation rolls back failed updates automatically. For a "successful but wrong" update,
check out the previous tag and deploy again.

### E. Accidental `destroy.sh` on prod
The table and user pool are retained. Redeploy, then import them as in B. The admin user and
group are recreated by the stack. The admin may need a password reset.

### F. Lost AWS account or region outage
This is accepted as unlikely for a small business. The recovery is to redeploy from git into
a new account or region, then restore the data from the most recent **Excel export**, which
the business keeps as its records, re-entered through a one-off import script. Cross-region
backup copies (AWS Backup) were deliberately left out for cost and simplicity. See
[aws-services.md](aws-services.md).

## Routine checks

| When | What |
|---|---|
| Before each season | `scripts/status.sh prod`. Make a test order in prod, then cancel and erase it. |
| After each season | Export all orders to Excel and keep it as the business record. Take an on-demand backup named `kvc-prod-main-season-<year>`. |
| Yearly | Delete on-demand backups older than the retention policy (18 months, Q14) |
