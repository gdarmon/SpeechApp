# Reviewing AI-content reports

Fala 0.12.1 adds reporting inside the Android conversation-options dialog, the web conversation-options dialog, and both end-of-session reviews. Reports contain a server-selected saved AI response/review, the learner's category and optional note. They do not accept arbitrary replacement model output. Account ownership is verified before reading the selected content. Repeated submissions for the same target return the same receipt. Up to 20 new reports per account per day are accepted without making another AI request.

Apply `supabase/migrations/202609210002_content_reports.sql` before deploying. The table has RLS and no browser-role privileges. Reporting is authenticated; there is no public report feed. Deleting a conversation, resetting learning data or deleting the account removes its reports through foreign-key cascades.

The operator can review reports privately in Supabase SQL Editor:

```sql
SELECT id, category, note, content, created_at
FROM fala.content_reports
WHERE status = 'open'
ORDER BY created_at;
```

Review the reported content, correct reproducible teaching defects, and update restrictions where appropriate. Do not post transcripts or notes in public GitHub issues. Mark handled reports by ID with `UPDATE fala.content_reports SET status='reviewed' WHERE id='the-report-uuid';`. This queue is not emailed or automatically monitored. The operator should check it regularly before and throughout closed testing.

This flow handles AI content. It is not a substitute for handling offensive user-entered circle names or nicknames in the separate social features.
