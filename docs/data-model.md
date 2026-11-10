# Data model in DynamoDB

This page shows how the entities in [design §5](design.md#5-data-model) are stored in DynamoDB: the table, its keys and indexes, and the query behind every read and write the app makes in Milestones 1 and 2. Read it before you write code that touches the database.

DynamoDB has no joins, so the keys are designed around the questions the app asks ("a teacher's assignments for the next 4 Sundays"), not around the entities. If you need a query that isn't in [Access patterns](#access-patterns), add it here first, in the same pull request as the code.

## Contents

- [One table](#one-table)
- [Items and keys](#items-and-keys)
- [Indexes](#indexes)
- [Access patterns](#access-patterns)
- [The conditional write](#the-conditional-write)
- [Copied fields](#copied-fields)
- [Limits](#limits)
- [Billing](#billing)

## One table

The app keeps people, classes and assignments in **one table**, the single-table design AWS recommends for DynamoDB. The table's name comes from an environment variable, so development and production use separate tables ([#33]).

We chose one table over three (People, Classes, Assignments) because:

- **Each screen is one Query.** A teacher's dashboard reads one index, and the leader's 4-Sunday schedule (classes and their assignments together) reads another. With three tables, the schedule takes about eight Queries plus merging in code.
- **A class and its assignments live together.** They share a partition key, so loading a class with everyone assigned to it is one Query, and reassigning a teacher is one transaction on one table.
- **One table to create, name and grant access to**, in the setup script ([#33]) and the EC2 instance's IAM role ([#42]).

The costs: the keys are more abstract than three named tables, which is why this page exists; some fields are copied onto assignments and have to be kept in step (see [Copied fields](#copied-fields)); and every class sits in one `SCHEDULE` partition, which is fine for one ward and would need a ward ID in its place if the app ever supports several (a [non-goal](design.md#2-goals-and-non-goals)).

## Items and keys

Every item has a partition key `pk` and a sort key `sk`, both strings. The prefix (`PERSON#`, `CLASS#`, `ASSIGN#`) says what kind of item it is. IDs are UUIDs from `crypto.randomUUID()`. Dates are `YYYY-MM-DD` strings, so they sort in date order.

| Item | `pk` | `sk` | Other attributes |
|---|---|---|---|
| Person | `PERSON#<person_id>` | `PERSON` | `person_id`, `name`, `role` (`admin`, `leader` or `teacher`), `email` (optional, lowercase), `user_id` (optional, the Cognito `sub`) |
| Class | `CLASS#<class_id>` | `CLASS` | `class_id`, `name`, `date`, `num_teachers` |
| Assignment | `CLASS#<class_id>` | `ASSIGN#<person_id>` | `class_id`, `person_id`, `status` (`pending`, `confirmed` or `substitute requested`), `updated_at`, and copies of `class_name`, `date` and `person_name` |

Items also carry the index attributes below. An item without an index's attributes doesn't appear in that index.

| Item | `gsi1pk` | `gsi1sk` | `gsi2pk` | `gsi2sk` |
|---|---|---|---|---|
| Person | `PEOPLE` | `<role>#<name>#<person_id>` | — | — |
| Class | — | — | `SCHEDULE` | `<date>#<class_id>` |
| Assignment | `PERSON#<person_id>` | `<date>#<class_id>` | `SCHEDULE` | `<date>#<class_id>#<person_id>` |

### Example

One class on Nov 22 with one teacher who has confirmed it, using made-up data. IDs are shortened to `p1` and `c1` here.

| `pk` | `sk` | `gsi1pk` | `gsi1sk` | `gsi2pk` | `gsi2sk` | Other attributes |
|---|---|---|---|---|---|---|
| `PERSON#p1` | `PERSON` | `PEOPLE` | `teacher#Teacher A#p1` | | | name: Teacher A, role: teacher, email: teacher.a@example.com, user_id: (Cognito sub) |
| `CLASS#c1` | `CLASS` | | | `SCHEDULE` | `2026-11-22#c1` | name: Gospel Doctrine, date: 2026-11-22, num_teachers: 1 |
| `CLASS#c1` | `ASSIGN#p1` | `PERSON#p1` | `2026-11-22#c1` | `SCHEDULE` | `2026-11-22#c1#p1` | status: confirmed, class_name: Gospel Doctrine, date: 2026-11-22, person_name: Teacher A |

## Indexes

All four are global secondary indexes that project all attributes.

| Index | Partition key | Sort key | What it answers |
|---|---|---|---|
| `GSI1` | `gsi1pk` | `gsi1sk` | A person's assignments by date (`PERSON#<id>`), and everyone by role (`PEOPLE`) |
| `GSI2` | `gsi2pk` | `gsi2sk` | Every class and assignment by date (`SCHEDULE`) |
| `ByUser` | `user_id` | — | The Person for a signed-in Cognito user |
| `ByEmail` | `email` | — | The Person with an email, when someone signs up |

`ByUser` and `ByEmail` are sparse: a Person without an account or email isn't in them.

## Access patterns

Every read and write the app makes in Milestones 1 and 2. None of them scans the table.

| # | Pattern | Service method | Milestone | How |
|---|---|---|---|---|
| 1 | The Person for the signed-in user, on every request | User `findByUser(user_id)` | 1 ([#36]) | Query `ByUser`: `user_id = :sub` |
| 2 | A teacher's assignments for the next 4 Sundays | Class `listAssignments(person, dates)` | 1 ([#37]) | Query `GSI1`: `gsi1pk = PERSON#<person_id>` and `gsi1sk BETWEEN :from AND :to` (see [Date windows](#date-windows)) |
| 3 | A teacher confirms or requests a substitute | Class `update(class, person, status)` | 1 ([#38]) | UpdateItem on the assignment's key, with a condition (see [The conditional write](#the-conditional-write)) |
| 4 | Seed teachers, classes and assignments | seed script | 1 ([#34]) | PutItem. A Put replaces the whole item, so running the script again resets every seeded assignment to `pending`. The script uses hard-coded keys rather than UUIDs to make this reset possible. |
| 5 | Every class and assignment for the next 4 Sundays | Class `listSchedule(dates)` | 2 ([#48]) | Query `GSI2`: `gsi2pk = SCHEDULE` and `gsi2sk BETWEEN :from AND :to`. Class Service works out covered, tentative and uncovered from the results |
| 6 | One class with everyone assigned to it | Class Service | 2 ([#48]) | Query: `pk = CLASS#<class_id>` |
| 7 | Everyone, to pick a teacher to assign | User Service | 2 ([#48]) | Query `GSI1`: `gsi1pk = PEOPLE` |
| 8 | The leaders' emails | User `listLeaders()` | 2 ([#47]) | Query `GSI1`: `gsi1pk = PEOPLE` and `begins_with(gsi1sk, "leader#")` |
| 9 | Add a person | User `create(name, email?)` | 2 ([#48], [#49]) | Query `ByEmail` first if there's an email, then PutItem with `attribute_not_exists(pk)` |
| 10 | Link a new account to an existing Person | User `linkAccount(user_id, email)` | 2 ([#49]) | Query `ByEmail`. If a Person is found, UpdateItem `SET user_id` with `attribute_not_exists(user_id)`; if not, PutItem a new teacher |
| 11 | Add a class | Class `createClass()` | 2 ([#48]) | PutItem with `attribute_not_exists(pk)` |
| 12 | Assign a teacher to a class | Class `assign(class, person)` | 2 ([#48]) | GetItem the class and the Person for the copied fields, then TransactWriteItems: ConditionCheck that both still exist, and Put the assignment with `attribute_not_exists(pk)` |
| 13 | Replace one teacher with another | Class `reassign(class, from, to)` | 2 ([#48]) | TransactWriteItems: Delete the old assignment with `attribute_exists(pk)` and Put the new one with `attribute_not_exists(pk)` |
| 14 | A leader records a response for someone | Class `update(class, person, status)` | 2 ([#49]) | The same UpdateItem as pattern 3; the API checks that the caller is a leader |

### Date windows

"The next 4 Sundays" is today through 28 days from today, on the server's date ([#37]). Patterns 2 and 5 use:

- `:from` = today, for example `2026-11-15`
- `:to` = the last day followed by `~`, for example `2026-12-13~`

Sort keys start with the date, so `BETWEEN` compares them as strings. `~` sorts after `#`, digits and letters, so `2026-12-13#c1` is inside the window and `2026-12-14#c2` isn't.

## The conditional write

Confirming a lesson or requesting a substitute (pattern 3) is one UpdateItem:

```
Key:                 { pk: "CLASS#<class_id>", sk: "ASSIGN#<person_id>" }
UpdateExpression:    SET #status = :status, updated_at = :now
ConditionExpression: attribute_exists(pk)
```

- `person_id` is always the caller's own, from the verified JWT and `findByUser()`. It never comes from the request.
- **The condition is the permission check.** The assignment exists only if this person is assigned to this class. If they aren't, or a leader has just reassigned the class to someone else, DynamoDB rejects the write with `ConditionalCheckFailedException`, nothing changes, and the API returns 403 ([#38]).
- **Without the condition**, UpdateItem would create the item if it didn't exist, so a teacher could assign themselves to any class, or bring back an assignment a leader had just removed.
- Sending the same status twice succeeds both times and leaves the same result, so a retry after an error is safe.
- The API checks that `status` is `confirmed` or `substitute requested` before the write (400 otherwise).

## Copied fields

To keep each screen to one Query, assignment items carry copies of `class_name` and `date` (from the class) and `person_name` (from the Person), and the date is part of their index keys. Whatever changes the original must update the copies in the same transaction:

- **A class is renamed or moved to another date:** Query `pk = CLASS#<class_id>` for its assignments and update each one, including `gsi1sk` and `gsi2sk` when the date changes.
- **A person is renamed:** Query `GSI1` for `PERSON#<person_id>` and update each assignment, and the Person's own `gsi1sk`.
- **A person's role changes:** update the Person's `gsi1sk`.

Milestones 1 and 2 have no screens for renaming, so for now this only matters to scripts that edit data.

## Limits

- **Email isn't unique in the database.** DynamoDB can't enforce a unique attribute in an index, so User Service checks `ByEmail` before adding a person or linking an account. Two leaders adding the same email at the same moment could still create a duplicate. With one presidency, we accept that.
- **Indexes are eventually consistent.** For a moment after a write, a Query on an index can miss it. `linkAccount()` returns the Person it linked or created, so the first request after sign-up doesn't depend on `ByUser` catching up.
- **One schedule partition.** Every class and assignment shares `gsi2pk = SCHEDULE`. One ward makes a few hundred items a year, far below where that matters.

## Billing

The table uses **on-demand capacity** (`PAY_PER_REQUEST`), so there's no capacity to plan and an idle development table costs nothing. At the ward's size (a few dozen people and a few hundred assignments a year) requests cost fractions of a cent a month, and storage is far under DynamoDB's 25 GB free tier. That's how the app meets the design goal of running cost near zero ([§2](design.md#2-goals-and-non-goals)).

[#33]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/33
[#34]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/34
[#36]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/36
[#37]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/37
[#38]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/38
[#42]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/42
[#47]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/47
[#48]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48
[#49]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/49
