# Known issues

What doesn't work yet, as of Milestone 1. Each entry says what happens, when it bites, any workaround, and the issue that tracks it. If you hit something that isn't here, please [open a bug report](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/new/choose).

## Throwaway corners

These are temporary on purpose. Don't build on them as if they were the real thing.

### Data and accounts come from a seed script

- **What happens:** there's no way to create classes or assign teachers in the app. People can sign up, but a new account starts as a teacher with no assignments. The seed script creates two made-up teachers (with `example.com` addresses), their Cognito accounts, classes on the next 4 Sundays and pending assignments.
- **When it bites:** whenever you want different classes or assignments.
- **Workaround:** edit `api/src/db/seed.ts` and run `npm run seed` again (see the [setup guide](setup.md#load-the-seed-data)). Running it again doesn't create duplicates, and it resets every seeded assignment to pending.
- **Tracked in:** [#34] (the seed script). Leaders building the schedule is [#48] (Milestone 2).

### Nobody is notified when a teacher responds

- **What happens:** confirming or requesting a substitute saves the new status, but no email goes to the presidency.
- **When it bites:** every response, until Milestone 2.
- **Workaround:** none in the app.
- **Tracked in:** [#47].

### "The next 4 Sundays" is a 28-day window on the server's date

- **What happens:** the dashboard shows assignments from today through 28 days from today, using the server's clock. Near midnight, a class can show up a day early or late, and the window can include a fifth Sunday.
- **When it bites:** near midnight, and whenever today is a Sunday (the window then includes today's Sunday plus the next four).
- **Workaround:** none needed for the demo or the pilot.
- **Tracked in:** [#79], with time zones on the [roadmap](roadmap.md).

### Every failure shows the same error message

- **What happens:** any failed request (a server error or no response) shows "Something went wrong. Please try again.", whatever the cause.
- **When it bites:** when the database or the network is down.
- **Workaround:** try again. Saving the same status twice is safe.
- **Tracked in:** the [roadmap](roadmap.md#3-specific-error-messages-idea). The generic message came from [#40] and [#41].

## Deliberate cuts

### The app only runs locally

- **What happens:** there's no hosted copy yet. You run the API and UI on your own machine, and they still need the real Cognito pool and DynamoDB tables in AWS.
- **When it bites:** you can't send someone a link to try it.
- **Workaround:** follow the [setup guide](setup.md).
- **Tracked in:** [#30] (Milestone 2).

### Signing out doesn't stop a copied token from working

- **What happens:** after `POST /api/logout`, Cognito rejects the access token, but the API checks tokens itself, against the pool's signing keys, without asking Cognito. So the API accepts the token until it expires: up to 1 hour in AWS, or 24 hours in cognito-local.
- **When it bites:** only if someone copied the token before the user signed out.
- **Workaround:** none needed for the demo or the pilot. Asking Cognito on every request would end the session at once, but it makes every request slower and counts against Cognito's request limits.
- **Tracked in:** [#77].

## Open bugs

### `npm install` reports vulnerabilities

- **What happens:** `npm install` reports 47 vulnerabilities in `api` and 51 in `web` (moderate and high).
- **When it bites:** every install, when you follow the [setup guide](setup.md).
- **Workaround:** safe to ignore for local development. All of them come from three file-matching libraries (picomatch, glob, minimatch) inside the development tools (Jest, ESLint, Vite). `npm audit --omit=dev` finds none in the packages the app runs with. Don't run `npm audit fix --force`: it makes breaking upgrades.
- **Tracked in:** [#85].

### The dashboard is cut off on narrow screens

- **What happens:** on phone and small tablet widths, the right edge of the page (the Sign out link and the right side of each assignment card) is cut off.
- **When it bites:** on a phone, or in a narrow browser window.
- **Workaround:** scroll sideways.
- **Tracked in:** [#86].

### Keyboard focus is lost after answering

- **What happens:** after you confirm or ask for a substitute with the keyboard, the button you pressed goes away and focus jumps to the top of the page.
- **When it bites:** for keyboard and screen reader users, on every answer.
- **Workaround:** press Tab to move back down to the card.
- **Tracked in:** [#91].

[#30]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/30
[#34]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/34
[#40]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/40
[#41]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/41
[#47]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/47
[#48]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48
[#77]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/77
[#79]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/79
[#85]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/85
[#86]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/86
[#91]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/91
