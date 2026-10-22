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

Before being merged into main, a change must go through self-review by the author, an optional AI review, and a formal review by a human other than the author. It also must be free of merge conflicts and pass all CI checks (testing, linting, etc.) if any exist. Not every change must start with an issue, but most of them should.