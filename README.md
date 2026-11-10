# Sunday-School-Scheduler
The Sunday School Scheduler is a web app designed to help a Sunday School presidency coordinate Teacher schedules quickly and efficiently so that every lesson is covered.

**Status**: Milestone 1 is in progress (see the [milestones](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/milestones) and the [MVP plan](docs/mvp-plan.md)). See [known issues](docs/known-issues.md) for what doesn't work yet.

## Quickstart
You need Git and Node.js 20.19+, 22.13+, or 24+. Versions 21 and 23 are not supported. Start the API:

```sh
git clone https://github.com/Sunday-School-Software/Sunday-School-Scheduler.git
cd Sunday-School-Scheduler/api
npm install
npm run dev
```

Then start the UI in a second terminal, from the `Sunday-School-Scheduler` folder:

```sh
cd web
npm install
npm run dev
```

Open http://localhost:5173. The page shows the API's health check, `"status": "ok"`. See the [setup guide](docs/setup.md) for running the tests and everything else.

## Contributing
Looking to become a contributor? See the [contributing guide](CONTRIBUTING.md) for guidance on where to start.
The [project board](https://github.com/orgs/Sunday-School-Software/projects/2) shows what's being worked on now.

## Roadmap
See the [roadmap](docs/roadmap.md) for what comes after the December MVP, what was cut from it, and where you can help.

## License
I chose the GNU Affero General Public License (AGPL) v3.0 for this project.

The AGPL v3 license keeps all the major advantages of an open source project; it allows others to view, copy, modify, contribute to, and share the code freely. It even allows people to sell the code as a product, provided that the source code remains available. However, it does not allow distribution of the code or any of its derivatives without using the same license. If anyone uses AGPL code on another project, that project also has to use the AGPL license. This is slightly less permissive than something like MIT in the fact that it doesn't allow people to use it in a closed-source or proprietary project. AGPL, as opposed to GPL, also applies these restrictions to code hosted on a server, which would include most of my project's code.

See the full license [here](LICENSE).
