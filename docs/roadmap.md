# Roadmap

The MVP is [Milestone 2: MVP Complete](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestone/3), due Dec 2, 2026. It covers what the ward pilot on Nov 29 and Dec 6 needs: teachers confirm lessons or ask for a substitute, leaders build the 4-Sunday schedule and get an email for every response, teachers without accounts are covered, and the app runs on EC2 behind Caddy. This page is what comes after that.

For current work, the [milestones page](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestones) and the [project board](https://github.com/orgs/Sunday-School-Software/projects/2) are the live plan. This page was written in November 2026, before the pilot. What the pilot teaches us may change the order.

Each item is labeled:

- **Planned:** we expect to build it.
- **Idea:** a dream, not a commitment. It may never happen, and that's fine.

Sections are in order (cut items first, then Next, then Later), but the items in each section are not in any particular order.

## Cut from the MVP

These were cut to fit the MVP into the time we had. The pilot will run without them.

Deployment moved from Milestone 1 to Milestone 2, but it's still part of the MVP, so it isn't listed here.

### 1. Safe concurrent edits for leaders (Planned)

- **What a user loses:** if two leaders edit the same class or assignment at the same time, the later save can overwrite the earlier one without either of them knowing. A lost update could show a class as covered when it isn't.
- **Why it was cut:** time. The pilot has one leader editing, so it can wait. Cut from [#48](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48); see the concurrent-edit risk in [design §7](design.md#7-risks-and-open-questions).
- **What's already planned:** a teacher's own status change is planned to be a conditional write ([#38](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/38)). The open part is leader edits to classes and assignments.
- **What it needs first:** the leader edit routes from [#48](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48).
- **How to help:** open an issue to agree on the approach (for example, the same kind of conditional write #38 uses, plus a message when a leader's save loses), then build it once #48 is merged.

### 2. Time zones for "the next 4 Sundays" (Planned)

- **What a user loses:** "the next 4 Sundays" is really today plus 28 days, using the server's date. A class can show up a day early or late. When today is a Sunday, the window can include a fifth Sunday.
- **Why it was cut:** time. Cut from [#37](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/37).
- **What it needs first:** [#37](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/37) merged, and a decision on which time zone to use. #37 asks for the date math to live in its own function, so the fix should be small and easy to test.
- **How to help:** once #37 is merged, open an issue proposing the time zone, then fix the date function and add tests for a Sunday and for late Saturday night.

### 3. Specific error messages (Idea)

- **What a user loses:** every failed request (a server error or no response) shows the same message: "Something went wrong. Please try again." A teacher can't tell whether the server is down or their own connection dropped. [Design §4](design.md#the-failure-case) describes a more specific message for a failed save.
- **Why it was cut:** time, in Milestone 1 ([#40](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/40), [#41](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/41)). The generic message still tells people to try again, and saving the same status again is safe.
- **What it needs first:** [#40](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/40) and [#41](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/41) merged, and pilot users saying the generic message confused them. It's small and only touches the UI, so it could become a `good first issue`.
- **How to help:** if the generic message confused you in the pilot, open an issue saying what you were doing when you saw it.

## Next

### 4. Admin: accounts and roles in the app (Planned)

- **What a user could do:** an admin creates accounts and sets each person's role (admin, leader or teacher) in the app.
- **Why it isn't in the MVP:** the proposal made admin a P1 goal, after the MVP. Until then, people sign up and leader roles are added by hand ([design §2](design.md#2-goals-and-non-goals)). With one ward and a small presidency, that's workable for the pilot.
- **What it needs first:** the MVP, especially people and account linking from [#49](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/49). The `admin` role is already in the data model ([design §5](design.md#5-data-model)).
- **How to help:** open an issue that sketches the admin screen and the API rule for who can change a role.

### 5. Broadcast: message all teachers at once (Planned)

- **What a user could do:** a leader sends one message to every teacher instead of writing to each one.
- **Why it isn't in the MVP:** like admin, it's a P1 goal from the proposal. [Design §8](design.md#8-implementation-plan) estimates admin and broadcast together at about 3–4 hours.
- **What it needs first:** the Email Service from [#47](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/47) and SES production access from [#50](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/50). Teachers with no email ([#49](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/49)) won't get a broadcast, so leaders still need another way to reach them.
- **How to help:** open an issue to decide what a broadcast looks like and what the leader sees if some emails fail.

## Later

### 6. Lesson notes (Idea)

- **What a user could do:** attach a short note to one class on one Sunday. The data model has a Lesson note entity marked "Roadmap", with a class, an author and some content ([design §5](design.md#5-data-model)).
- **What it isn't:** a place for teachers to share lesson plans or other content. That's a non-goal (see [Non-goals](#non-goals)). The design doesn't yet say who can read a note, so that's the first thing to decide.
- **Why it isn't in the MVP:** the MVP's goals ([design §2](design.md#2-goals-and-non-goals)) are about getting every class a teacher, and notes don't help with that.
- **What it needs first:** the MVP, and an agreed answer in an issue to who writes and reads notes.
- **How to help:** if you're a teacher or leader and would use notes, open an issue saying what you'd write and who should see it.

### 7. SMS notifications (Idea)

- **What a user could do:** get assignment and response notifications by text instead of email.
- **Why it isn't in the MVP:** SMS is a non-goal for the MVP ([design §2](design.md#2-goals-and-non-goals)). It needs registration steps we couldn't count on finishing this semester, and in the CP3 spike, SES delivered email but SNS didn't deliver SMS ([design §6](design.md#decision-send-notifications-by-email-through-aws-ses)).
- **What it needs first:** evidence that email is too slow. Design §6 says SMS becomes a roadmap item if teachers say they don't check email fast enough to meet the 5-minute goal. It would also need phone numbers on Person, which raises the contact-information concerns in [design §7](design.md#7-risks-and-open-questions).
- **How to help:** if you're a teacher and email is too slow for you, say so in an issue. That's the evidence this needs. If you've set up SMS sending on AWS before, that experience helps too.

### 8. Move the API to Lambda (Idea)

- **What a user could do:** nothing changes for users. There would be no server to patch or keep running.
- **Why it isn't in the MVP:** the design puts the API on one EC2 instance, and the CP3 spike showed that working ([design §6](design.md#decision-put-a-node-backend-between-the-ui-and-aws)). Lambda only comes up if EC2 becomes a problem.
- **What it needs first:** evidence that the instance's cost or upkeep is a problem. Design §6 says the same routes could then move to Lambda behind API Gateway, with the role checks still on the server.
- **How to help:** if you know Lambda and API Gateway, open an issue comparing their cost and upkeep with the EC2 instance's once the app has run for a while.

## Non-goals

These are out of scope ([design §2](design.md#2-goals-and-non-goals)). If you think one should change, see below.

- Other organizations (Relief Society, Elders' Quorum, Primary). The data model is Sunday School–specific.
- More than one ward. There's no multi-tenant separation.
- Lesson-plan and content sharing between teachers.
- SMS notifications in the MVP. Email only (see item 7 for when that could change).
- Importing members from Member Tools or other Church systems.

If you think a non-goal should change, open an issue that explains the problem it would solve and who has it. The maintainer makes the final call and explains why in the thread ([communication norms](communication-norms.md#making-decisions)).

## How to help

None of the items above has its own issue yet. To work on one:

1. Check the [open issues](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues) first. If the item has an issue, comment on it.
2. If it doesn't, open one with the [feature request form](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/new?template=feature_request.yml). Name the roadmap item and describe the problem it solves.
3. Agree on the approach in the issue before you start a large change.

If you'd rather start small, pick up an open issue labeled [`good first issue`](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). If you used the app in the pilot, an issue about what was slow, confusing or missing is just as useful as code.

See the [contributing guide](../CONTRIBUTING.md) for how to get set up and how pull requests work.
