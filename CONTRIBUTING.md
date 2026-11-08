# Contributing to Sunday School Scheduler

Thank you for your interest in contributing to this project!

By participating in this project, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## How to get started

1. Read the [setup guide](docs/setup.md) to get the project running locally.
2. Find an issue you want to work on. The [`good first issue` list](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/labels/good%20first%20issue) is a good place to start, and anything in the Ready column of the [project board](https://github.com/orgs/Sunday-School-Software/projects/2) can be picked up.
3. Comment on the issue saying you'd like to take it, and wait for a maintainer to assign you. See the [communication norms](docs/communication-norms.md) for communication rules and when to expect a reply.

## Reporting bugs and requesting features

Open an issue from the [new issue page](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/new/choose) and pick the form that fits:

- **Bug report:** something isn't working the way it should.
- **Feature request:** a new feature or an improvement.
- **Task:** work that's already been decided, written so someone can pick it up and know when it's done.
- **Security problems:** don't open a public issue. Email the maintainer at sunday.school.software@gmail.com.

## Labels

We use GitHub's default labels (`bug`, `enhancement`, `question`, `good first issue`, and so on), plus these:

| Label | What it means | Who adds it |
|---|---|---|
| `good first issue` | Small and well described. A good first contribution. | A maintainer |
| `needs triage` | A maintainer hasn't looked at it yet. | The issue forms. A maintainer removes it during triage. |
| `task` | Planned, decided work. | The task form, or a maintainer when a request becomes a task |
| `epic` | A parent issue for a large piece of work. Its sub-issues are the actual work. | A maintainer |
| `current` | Being worked on now. | A maintainer |
| `next` | What comes after the current work. | A maintainer |
| `slice` | Part of [Milestone 1](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestone/2), the thinnest slice of the app, demoed on Nov 18. | A maintainer |

The default labels say what kind of issue something is. The extra labels say where it fits in the plan, so you can see that from the issue list without opening the board.

`slice` and `current` answer different questions. `slice` marks everything the Milestone 1 demo needs, whether or not anyone has started it. `current` marks what's being worked on right now. A `slice` issue can be `next` while other work is `current`.

## Triage

The bug report and feature request forms add `needs triage` (so does the task form). Within 1 week (see the [communication norms](docs/communication-norms.md)), a maintainer replies and does one of these:

- **Accept it:** rewrite it as a task below the original request, which stays in place. See [#21](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/21) for an example.
- **Split it:** break it into smaller tasks, or an epic with sub-issues.
- **Decline it:** close it.

The maintainer says why on the issue and removes `needs triage`.

## The project board

The [project board](https://github.com/orgs/Sunday-School-Software/projects/2) shows every open issue and where it stands.

| Column | What it means | Who moves the card there |
|---|---|---|
| Backlog | Not ready to start. | New issues are added here automatically. |
| Ready | The acceptance criteria are written and nothing it depends on is unfinished. Anyone can pick it up. | A maintainer |
| In Progress | Someone is working on it. | The person who took it |
| In Review | A pull request is open and waiting for review. | The pull request author |
| Done | The pull request is merged and/or the issue is closed. | GitHub, when the pull request merges |

When you start an issue, comment "I'm on this" and wait for a maintainer to assign you. When you're assigned, move its card to In Progress. When you open the pull request, write `Closes #N` in the description (where N is the issue number) and move the card to In Review (if it isn't moved there automatically). When the pull request merges, GitHub closes the issue and moves the card to Done. If you can't edit the board, a maintainer will move the card for you.

### Sizes

Each card has a Size, a rough guess of how long the work takes one person:

| Size | Time |
|---|---|
| XS | Under 1 hour |
| S | About 2 hours |
| M | About 4 hours |
| L | About 7 hours (one person's week on the project) |
| XL | More than a week. Split it into an epic. |

Sizes are relative, so a rough guess is fine. They're how we check a milestone's work against the hours available. [Milestone 1](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestone/2)'s description shows an example.

### Epics and milestones

Large work is an issue labeled `epic`, with its tasks as sub-issues. We use sub-issues instead of a checklist in the issue body so each epic shows a progress bar on the issue and on the board. Epics and tasks belong to a [milestone](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestones), and each milestone's description says what it delivers.

## The pull request process

See the [Git Standards](docs/git-standards.md) for style and naming conventions.

1. Fork the project and create a branch.
2. Implement the fix/feature, keeping each commit to one logical change.
3. Self-review including tests and linting where applicable.
4. Open the PR (make sure it follows the Git Standards).
5. Wait for a maintainer to assign someone to review your PR. While you're waiting, you can comment on another PR and volunteer to review it!
6. Once a PR is reviewed, a maintainer will merge it into the main branch.


## Expectations

The full rules are in the [git standards](docs/git-standards.md). In short:

- **Branch names:** a short, dash-separated description of the branch purpose.
- **Commit messages:** always start with a capital letter.
- **Pull requests:** include the issue addressed, the purpose of the change, and where a reviewer might start.
- **Review:** required by someone other than the author before merge.
- **Definition of done:** one logical changed, self-reviewed and reviewed by someone else, passing all tests and checks where applicable, and ready to be merged into main.

## Communication

For communication standards, see the [communication norms](docs/communication-norms.md).

## License

By contributing, you agree that your contributions will be licensed under the project's [AGPL v3.0 license](LICENSE).
