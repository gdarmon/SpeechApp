# Continue with another coding agent

The instructions and operational knowledge are committed to this repository. A new agent needs the checkout and normal access to the tools it will use; it does not need this chat, a Codex account, or the old machine's ignored `artifacts/` directory.

## Entry points

| Tool | Project entry point | Reusable procedures |
|---|---|---|
| Claude Code | Root `CLAUDE.md` imports `AGENTS.md` | `.claude/skills/fala-release/SKILL.md`, `.claude/skills/fala-debug/SKILL.md` |
| GitHub Copilot | `.github/copilot-instructions.md` and root `AGENTS.md` | The same `.claude/skills/` directories |
| Codex or another agent that reads AGENTS.md | Root `AGENTS.md` | Follow its links to the skill Markdown files |
| A tool without project-instruction support | Supply `AGENTS.md` and `docs/agent-handoff.md` explicitly | Supply the relevant skill/runbook explicitly |

Claude Code loads project skills from `.claude/skills/` and supports `/fala-release` and `/fala-debug`. `CLAUDE.md` uses its documented `@AGENTS.md` import. [Claude skills](https://code.claude.com/docs/en/skills), [project memory](https://code.claude.com/docs/en/memory).

Copilot supports repository instructions in `.github/copilot-instructions.md` and project skills in `.claude/skills/` as well as its other supported skill directories. Support can vary by client/version/settings; if automatic selection does not happen, explicitly name the skill and ask it to read the file. There is one shared skill implementation here, not separate copies to maintain. [Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions), [Copilot skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills).

This repository does not install personal skills into an agent's home directory or alter its global permissions. Codex can follow the repository links; automatic skill registration in a particular Codex host is separate from reading these portable instructions.

## First session

1. Clone/open `gdarmon/SpeechApp`; inspect the current branch, working tree and latest `origin/main`.
2. Read `AGENTS.md`, then `docs/agent-handoff.md`. Read only the feature references needed for the task.
3. Use the pinned local toolchain and run the relevant checks. Most development tests require no cloud credentials.
4. For an authorized release, establish the machine's normal GitHub/Netlify/database access using the release runbook. GitHub Actions already holds the Play signing/publishing secrets; do not download them to the agent.
5. Keep behavior docs and dated release evidence current. Update this setup page if changing skill locations or agent entry points.

## Example requests

For a development task:

> Read AGENTS.md and docs/agent-handoff.md. Fix the reported issue, preserve existing work, run the relevant checks and update the affected documentation. Do not publish yet.

For an authorized release:

> Use fala-release and docs/releasing.md. Publish the prepared version to the Fala website/API, Google Play internal testing and the existing closed Alpha track. Verify each result and record the version, build and review state. Do not publish to production.

For diagnosis:

> Use fala-debug. On Android version X, the question changes but the two suggested replies repeat. Find the cause and prepare a tested fix. Separate code findings from anything requiring a live measurement.

## Access and portability limits

An agent instruction file supplies knowledge, not accounts or permission. Local CLI logins, database-owner credentials and private signing backups are intentionally absent from Git. GitHub-hosted agents may have a restricted token, no Netlify connection, or no Android SDK; they can still prepare code/PRs and use configured Actions checks. State the exact missing access if an authorized external step cannot run.

Nothing here changes the app's AI provider. Switching the coding assistant to Claude or Copilot is independent of Fala's configured Groq/OpenAI services.
