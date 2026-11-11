# MVP Plan: Milestone 1, Nov 18 demo

### 1. What's in

**Slice** ([Milestone 1](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestone/2)): a teacher signs in, sees 4 Sundays of seeded assignments and confirms one. It runs locally on real Cognito and DynamoDB, returns 403 for others' assignments and shows a DB-down error. **Issues:** data ([#27]: [#31], [#33], [#34]); sign-in ([#28]: [#32], [#35], [#36]); confirm ([#29]: [#37], [#38], [#39], [#40], [#41]); ward-teacher test ([#65]).

### 2. What's deferred

- **The cut: deployment** ([#30]); it proves no claim below. **Also Milestone 2:** sign-up ([#69]), leader emails ([#47]), scheduling ([#48]), no-account teachers ([#49]), the pilot ([#50]). **Later:** [roadmap](roadmap.md).
- **Throwaway corners** ([known issues](known-issues.md)): seeded fake data and accounts; no response emails; "next 4 Sundays" = 28 days on the server's date; one generic error.
- **Emergency cut: sign-in with Cognito** ([#28]). It doesn't fit the claims as strongly as the other epics and can move to M2 if time is running low.

### 3. What risk it addresses

"DynamoDB keys for relational data" ([design §7](design.md#7-risks-and-open-questions)) is retired if the 4-Sunday list is one Query on [#31]'s keys (no Scan), a response is a conditional write, and it costs $0.

### 4. Demo plan: claims, most doubtful first

1. **Need** ([CP2](design.md#2-goals-and-non-goals)): an easier way to answer. *Evidence:* the ward teacher would sign up, not text.
2. **Usability:** a teacher does it alone in a minute. *Evidence:* told only "confirm the 22nd, ask for a sub on the 29th," they finish, sign-in included.
3. **Technical:** free-tier DynamoDB fits. *Evidence:* §3's checks, shown live.

**Falsifier:** if the teacher can't finish alone in a minute or would rather text, sign-in is the wrong front door, and Milestone 2 moves email-link answers ahead of leader features.

**Script:**
1. Claim: a teacher answers in under a minute; here's what a real teacher did and said. Include their thoughts about actually using the app.
2. Sign in, confirm one lesson, ask for a sub on another, refresh, show the DynamoDB row and the cost in Cost Explorer.
3. Run the 403 and DB-down tests. Honest edge: nobody is notified yet (Milestone 2).

**Fallback:** re-seed data, sign in early, phone hotspot for AWS; declared last resort: a rehearsal clip.

[#27]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/27
[#28]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/28
[#29]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/29
[#30]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/30
[#31]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/31
[#32]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/32
[#33]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/33
[#34]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/34
[#35]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/35
[#36]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/36
[#37]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/37
[#38]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/38
[#39]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/39
[#40]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/40
[#41]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/41
[#47]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/47
[#48]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/48
[#49]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/49
[#50]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/50
[#65]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/65
[#69]: https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/69
