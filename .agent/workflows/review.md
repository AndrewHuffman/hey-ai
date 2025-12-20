---
description: follow-up on PR reviews and comments
---

This workflow helps you address feedback on a Pull Request by fetching comments and proposed changes, then guiding you through the implementation of fixes or responses.

// turbo-all

1. Identify the current Pull Request.
2. Check CI status using `gh pr view --json statusCheckRollup`. If CI is failing, investigate the logs using `gh run view --log-failed`.
3. Fetch reviews and comments using `gh pr view --json reviews,comments`.
4. Analyze the feedback and prioritize items that need code or CI fixes.
5. For each feedback item or CI failure:
   - If it's a code suggestion, apply it or propose an alternative.
   - If it's a CI failure, implement the fix.
   - If it's a question, provide an answer.
   - If it's a request for changes, implement the necessary modifications.
6. Summarize the changes made in response to the review or CI logs.
7. (Optional) Reply to comments using `gh pr comment` or `gh pr review --comment`.
8. Delete reviews & comments files that you retrieved
9. Create commit(s) for changes
10. Update remote branch

### Example Command

```bash
gh pr view --json reviews,comments
```
