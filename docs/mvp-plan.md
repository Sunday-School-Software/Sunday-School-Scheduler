# MVP Plan: Milestone 1, Nov 18 demo

**Slice** ([Milestone 1](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestone/2)): a teacher signs in, sees 4 Sundays of seeded assignments, confirms one, and sees it marked confirmed. It runs locally on real Cognito and DynamoDB; the API rejects changes to others' assignments, and the UI shows the DB-down error.

## 1. What's in

- **Data in DynamoDB** ([#27]): key design ([#31]), tables ([#33]), seed data ([#34]).
- **Sign-in with Cognito** ([#28]): user pool ([#32]), login ([#35]), a caller check on every request ([#36]).
- **Teacher confirms a lesson** ([#29]): routes ([#37], [#38]), login ([#39]), dashboard ([#40]), buttons ([#41]).
- **Teacher test** ([#65]): a ward teacher tries the slice before Nov 18.

## 2. What's deferred

- **The cut: deployment** ([#30]): it proves none of the claims below. **Milestone 2:** SES notifications ([#47]), sign-up ([#69]), leaders build the schedule ([#48]), teachers without accounts ([#49]), the pilot ([#50]). Later: [roadmap.md](roadmap.md).
- **Throwaway corners** ([known-issues.md](known-issues.md)): seeded fake data and accounts; no notification on a response; "next 4 Sundays" = 28 days on the server's date; one generic error.

## 3. What risk it addresses

"DynamoDB keys for relational data" ([design §7](design.md#7-risks-and-open-questions)) is retired when the 4-Sunday list is one Query on [#31]'s keys (no Scan), a response is a conditional write, the API returns 403 for others' assignments, and DynamoDB costs $0.

## 4. Demo plan

| Rank | Claim (most doubtful first) | Evidence by Nov 18 |
|---|---|---|
| 1 | **Need:** teachers want a frictionless way to answer ([CP2](design.md#2-goals-and-non-goals)). | The ward teacher says if they'd use it over a text, and make an account. |
| 2 | **Usability:** another teacher gets through alone. | Told only "confirm the 22nd, ask for a sub on the 29th," they finish in under 1 minute, sign-in included. |
| 3 | **Technical:** free-tier DynamoDB fits. | Section 3's evidence, shown live. |

**Falsifier:** if the teacher can't finish unaided in a minute, or would rather text, signing in is the wrong front door: Milestone 2 puts responding by email link before the leader features.

**Script:**

1. Claim: a teacher answers an assignment in under a minute; here's what a real teacher did and said.
2. Sign in, confirm one lesson, request a substitute for another, refresh, and show the row in DynamoDB.
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
