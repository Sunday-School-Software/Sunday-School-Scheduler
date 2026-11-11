# Known issues

What doesn't work yet, as of Milestone 1. Each entry says what happens, when it bites, any workaround, and the issue that tracks it. If you hit something that isn't here, please [open a bug report](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/new/choose).

## Throwaway corners

These are temporary on purpose. Don't build on them as if they were the real thing.

### Data and accounts come from a seed script

- **What happens:** there's no way to create classes, assign teachers or sign up in the app. The seed script creates two made-up teachers (with `example.com` addresses), their Cognito accounts, classes on the next 4 Sundays and pending assignments.
- **When it bites:** whenever you want different data, or a new account.
- **Workaround:** edit the seed script and run it again. Running it again doesn't create duplicates, and it resets every seeded assignment to pending.
- **Tracked in:** [#34] (the seed script). Leaders building the schedule is [#48], and sign-up is [#69] (both Milestone 2).

### Nobody is notified when a teacher responds

- **What happens:** confirming or requesting a substitute saves the new status, but no email goes to the presidency.
- **When it bites:** every response, until Milestone 2.
- **Workaround:** none in the app.
- **Tracked in:** [#47].

### "The next 4 Sundays" is a 28-day window on the server's date

- **What happens:** the dashboard shows assignments from today through 28 days from today, using the server's clock. Near midnight, a class can show up a day early or late, and the window can include a fifth Sunday.
- **When it bites:** near midnight, and whenever today is a Sunday (the window then includes today's Sunday plus the next four).
- **Workaround:** none needed for the demo or the pilot.
- **Tracked in:** [#37], with time zones on the [roadmap](roadmap.md).

### Every failure shows the same error message

- **What happens:** any failed request (a server error or no response) shows "Something went wrong. Please try again.", whatever the cause.
- **When it bites:** when the database or the network is down.
- **Workaround:** try again. Saving the same status twice is safe.
- **Tracked in:** [#40] and [#41].

## Deliberate cuts

### The app only runs locally

- **What happens:** there's no hosted copy yet. You run the API and UI on your own machine, and they still need the real Cognito pool and DynamoDB tables in AWS.
- **When it bites:** you can't send someone a link to try it.
- **Workaround:** follow the [setup guide](setup.md).
- **Tracked in:** [#30] (Milestone 2).

## Open bugs

None yet.

[#30]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/30
[#34]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/34
[#37]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/37
[#40]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/40
[#41]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/41
[#47]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/47
[#48]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48
[#69]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/69
