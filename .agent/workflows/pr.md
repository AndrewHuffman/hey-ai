---
description: generate a pull request description based on the current changes and the project's template
---

This workflow automates the process of generating a Pull Request description by analyzing your current git changes and populating the project's PR template.

// turbo-all

1. Identify the base branch (usually `main` or `master`).
2. Generate a diff of the current changes against the base branch.
3. Read the project's PR template at `.github/pull_request_template.md`.
4. Analyze the diff and the template.
5. Populate the "Summary" and "Changes" sections of the template based on the analysis.
6. Present the generated PR description to the user.
7. Offer to create the Pull Request using `gh pr create --body "GENERATED_DESCRIPTION"`.

### Example Command

```bash
git diff main...HEAD
```
