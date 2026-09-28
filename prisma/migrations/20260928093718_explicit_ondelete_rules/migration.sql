-- DropForeignKey
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "widgets" DROP CONSTRAINT "widgets_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "nlq_sessions" DROP CONSTRAINT "nlq_sessions_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "agents" DROP CONSTRAINT "agents_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "agent_jobs" DROP CONSTRAINT "agent_jobs_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "agent_jobs" DROP CONSTRAINT "agent_jobs_agentId_fkey";

-- DropForeignKey
ALTER TABLE "agent_sync_batches" DROP CONSTRAINT "agent_sync_batches_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "agent_sync_batches" DROP CONSTRAINT "agent_sync_batches_agentId_fkey";

-- DropForeignKey
ALTER TABLE "agent_view_snapshots" DROP CONSTRAINT "agent_view_snapshots_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "agent_view_snapshots" DROP CONSTRAINT "agent_view_snapshots_agentId_fkey";

-- DropForeignKey
ALTER TABLE "billing_subscriptions" DROP CONSTRAINT "billing_subscriptions_customerId_fkey";

-- DropForeignKey
ALTER TABLE "billing_invoices" DROP CONSTRAINT "billing_invoices_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "bugs" DROP CONSTRAINT "bugs_submitted_by_id_fkey";

-- DropForeignKey
ALTER TABLE "bug_comments" DROP CONSTRAINT "bug_comments_authorId_fkey";

-- DropForeignKey
ALTER TABLE "demo_request_notes" DROP CONSTRAINT "demo_request_notes_authorId_fkey";

-- DropForeignKey
ALTER TABLE "demo_request_status_events" DROP CONSTRAINT "demo_request_status_events_authorId_fkey";

-- AlterTable
ALTER TABLE "bugs" ALTER COLUMN "submitted_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "bug_comments" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "demo_request_notes" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "demo_request_status_events" ALTER COLUMN "authorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nlq_sessions" ADD CONSTRAINT "nlq_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sync_batches" ADD CONSTRAINT "agent_sync_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sync_batches" ADD CONSTRAINT "agent_sync_batches_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_view_snapshots" ADD CONSTRAINT "agent_view_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_view_snapshots" ADD CONSTRAINT "agent_view_snapshots_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "billing_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_request_notes" ADD CONSTRAINT "demo_request_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_request_status_events" ADD CONSTRAINT "demo_request_status_events_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

