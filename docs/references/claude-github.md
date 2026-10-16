# Claude on GitHub

How Claude reviews pull requests and acts on review feedback in this repository.
Everything here runs on the owner's Claude subscription (the
`CLAUDE_CODE_OAUTH_TOKEN` repository secret, or the owner's claude.ai account) and
needs the [Claude GitHub App](https://github.com/apps/claude), which is installed
on the repository.

Anthropic's managed **Code Review** service (reviews on every PR with no workflow
file) is for Team and Enterprise plans only, so it isn't used here. The review
workflow below does the same job on a personal plan.

## The loop

```
PR opened / ready for review
  └─ claude-code-review.yml › auto-review   one review, inline comments (Claude bot)
       └─ Auto-fix                           reads the comments + CI, pushes fixes
            └─ CI re-runs; no second review  (the plugin skips PRs Claude has commented on)
  └─ you review the result and merge
```

| Piece | Where | Triggered by | Pushes code? |
|---|---|---|---|
| Automatic review | `.github/workflows/claude-code-review.yml`, job `auto-review` | PR `opened` / `ready_for_review`, not drafts, not forks | No |
| Review on request | same file, job `claude-review` | a `/claude-review` comment, or the Actions tab | No |
| `@claude` | `.github/workflows/claude.yml` | `@claude` in a PR comment, review or inline review comment | Yes, to the PR branch |
| Auto-fix | Claude Code (desktop app, or a cloud session) | review comments and failing checks on a PR it watches | Yes, to the PR branch |
| Triage routine fix PRs | the "Scheduled-failure triage" routine ([scheduled-job-monitoring.md](scheduled-job-monitoring.md#3-a-claude-code-routine-triages-each-new-issue)) | a new `scheduled-failure` issue | Opens the PR; auto-fix is on from creation |

## Automatic review

Runs Anthropic's `code-review` plugin (`/code-review:code-review --comment`). It
reads `CLAUDE.md` (which points at `AGENTS.md`), so the repo's architectural rules
apply. It posts inline comments on what it finds, or one summary comment when it
finds nothing.

It runs **once per PR**. The plugin skips drafts, closed PRs, trivial or automated
PRs, and any PR that already has a Claude comment. That is what keeps the loop
bounded: Auto-fix's commits are pushes, and pushes never trigger another review.
To ask for a second look after fixes, comment `/claude-review`, which runs the
repo's own review brief and doesn't check for earlier comments.

Most PRs here come from Claude sessions that already ran `/code-review` locally.
The automatic review is a second pass that mainly matters for PRs that skipped that
step (routine fix PRs, PRs made by hand).

## Addressing review comments

**Auto-fix** watches one PR and, for each new review comment or failed check,
pushes a fix when the fix is clear, or asks when it isn't. Turn it on for:

- **A PR a desktop-app session opened:** the Auto-fix switch on the session's PR
  bar. Runs while the desktop app is open.
- **Any PR, laptop closed:** run `/autofix-pr` in a terminal on the PR's branch. It
  starts a cloud session that watches the PR. Or paste the PR URL into a cloud
  session at claude.ai/code and ask it to auto-fix.

Replies Auto-fix posts on review threads use the owner's GitHub account, labeled
as written by Claude Code. GitHub sends no event when the base branch moves, so a
merge conflict needs a manual "rebase" request in the session.

**`@claude`** is for one-off requests: "@claude fix this", "@claude why does this
fail?". The job installs the same dependencies as CI, so Claude can run
`just preflight` before it pushes. Commits come from the Claude GitHub App, so CI
runs on them. Only people with write access can trigger it, and the action ignores
comments from bots, so the automatic review's comments can't start it.

The repo's `.claude/settings.json` (allowlist, guard hooks) applies in both
workflows. Its macOS sandbox is turned off there with the action's `settings`
input, since the runner is already a throwaway VM.

## Cost

Every review, `@claude` run and Auto-fix event draws on the owner's subscription
usage. GitHub Actions minutes are free on this public repository. The review is
capped at 40 turns, and `@claude` at 60 turns and 45 minutes.
