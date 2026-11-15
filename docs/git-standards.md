# Git standards

How a change gets into this project. If you're contributing, this is how we work; if you think a rule is wrong, open an issue and say why.

## Branch names

Convention: a short description of the purpose of the branch in all lowercase, with words separated by dashes.
Example: `git-standards`
Purpose: to keep remove extra complexity in branch creation while keeping branch name style consistent.

## Commit messages

Convention: a brief title describing the purpose of the commit in imperative form with the first letter capitalized, followed by a longer description of the purpose of the commit as needed.
Example: see commit 41e147bc69f0e3a922bf7b1e6d9ddbef6855f3aa
Purpose: to keep commit messages in a consistent format that's easily readable with various Git tools, and to provide a reasonably descriptive history of changes.

## Pull requests

Convention: one logical change, small enough to review in one sitting. The description must describe the purpose of the change and any notes for where a reviewer might start.
Purpose: to keep reviews short and focused, which will improve the general health of the codebase.

## Review

Convention: at least one human other than the author should review every PR, except in rare emergency cases and at the maintainer's discretion. Reviewers and authors are encouraged to use AI to aid in review, but it should not replace human review.
Purpose: to ensure that every approved PR is improving the general health of the codebase.

## Merging

Convention: squash and merge performed by a maintainer.
Purpose: to keep `main` clean and uncluttered while preserving history in other branches.

## Definition of done

Convention: a change is ready to merge into `main` only when every item below is true. Each item can be checked by looking at the PR. Not every change must start with an issue, but most of them should.

**Scope:** the PR is one logical change, small enough to review in one sitting.
- [ ] **Issue:** if there's a linked issue, the PR description says `Closes #N`.
- [ ] **Acceptance criteria:** every acceptance criterion in the linked issue is met, or the PR says which ones aren't and why.
- [ ] **Tests, lint, types, and build:** `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` pass in each project the change touches (`api/`, `web/`, or both). CI runs these commands on every push and pull request for each project the change touches, and the PR's checks show the results. To run them yourself first, run them from inside that project's folder (see the [setup guide](setup.md)). If the change touches neither project, CI runs no checks and the PR says so.
- [ ] **New tests:** new or changed behavior comes with tests that cover it.
- [ ] **Docs:** each doc the change affects is updated in the same PR:
  - How to install, run, test, or configure anything: [`docs/setup.md`](setup.md).
  - Architecture, the data model, or a design decision: [`docs/design.md`](design.md).
  - How contributors work: [`CONTRIBUTING.md`](../CONTRIBUTING.md), this file, or [`docs/communication-norms.md`](communication-norms.md).
  - Work that was cut or deferred: [`docs/roadmap.md`](roadmap.md).

  If no docs apply, the PR says "no docs affected".
- [ ] **Self-review:** the author reviewed their own changes before requesting review.
- [ ] **Human review:** a human other than the author approved the PR (see [Review](#review)). The maintainer may skip this in rare emergencies. AI review is optional and doesn't replace human review.
- [ ] **No conflicts:** the branch has no merge conflicts with `main`.

Who confirms each item:

- The author checks every item before requesting review, using the checklist in the PR template.
- The reviewer confirms every item before approving, including that the PR's CI checks pass.
- The maintainer checks that every item is still true before squash-merging.

Purpose: to give one list, in one place, that anyone can use to tell from the PR whether a change is done.
