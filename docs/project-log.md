# Project log

Time spent on Sunday School Scheduler.

This project is counting for two classes, so I've already started it.

## Estimated hours

These entries, through 11/17/2026, were reconstructed by AI from the repo's commit history, so their hours are estimates.

| Date | What | Hours |
|---|---|---|
| 10/13/2026 | Created the repo and wrote the project description in the README | 0.5 |
| 10/16/2026 | Drafted the design document | 0.5 |
| 10/20/2026 | Revised the design doc after review, replaced whiteboard photos with Mermaid diagrams, moved the services to a Node backend on EC2 | 2.5 |
| 10/21/2026 | Polished and trimmed the design doc, exported it to PDF, added the license summary, status line and git standards | 3 |
| 10/27/2026 | Added the README quickstart and the code of conduct | 1 |
| 10/28/2026 | Added the bug report issue template and drafted CONTRIBUTING.md | 1.5 |
| 10/29/2026 | Wrote the communication norms, finished CONTRIBUTING.md, added the feature request and PR templates | 2.5 |
| 11/2/2026 | Added the task issue template | 2 |
| 11/4/2026 | Scaffolded the Express API with a health endpoint and documented how to run it | 0.5 |
| 11/6/2026 | Updated the design doc's milestones, scaffolded the React UI | 1.5 |
| 11/7/2026 | Set up Jest tests for the API and UI, wrote the definition of done, the roadmap and the local setup guide | 4 |
| 11/9/2026 | Drafted the MVP plan, designed the DynamoDB single-table data model and its access patterns | 2 |
| 11/11/2026 | Cut the MVP plan to one page, wrote a script that creates the DynamoDB table, started the Cognito user pool script | 3 |
| 11/12/2026 | Finished the Cognito user pool script, wrote a script that seeds teachers and their assignments, added login and logout to the auth service | 2.5 |
| 11/13/2026 | Merged login and logout | 0.5 |
| 11/14/2026 | Verified the caller's token on every API request | 0.5 |
| 11/16/2026 | Built the login screen, the API route that lists a teacher's assignments for the next 4 Sundays (503 when DynamoDB is down), the teacher dashboard, the API route that confirms an assignment, and the dashboard's confirm and request-a-substitute buttons | 7 |
| 11/17/2026 | Revised the communication norms, started this log | 0.5 |
| **Total** | | **35.5** |

## Logged hours

Hours logged as I work, starting 11/18/2026.

| Date | What | Hours |
|---|---|---|
| 11/18/2026 | Researched the cost and setup time for text notifications, planned them as Milestone 3 in the design doc, roadmap and data model, and drafted the issues; planned the EC2 server and wrote the Terraform that creates it, its IAM role, security group and Elastic IP | 1.5 |
| 11/19/2026 | Worked out the server's monthly cost, added a setting that stops the instance when nobody needs the app, and created the production table and server in AWS and checked them | 1 |
| **Total** | | **2.5** |
