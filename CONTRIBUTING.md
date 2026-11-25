# Contributing

Zowl is a personal project its author uses every day. Bug reports and small, focused pull requests are welcome.
Open an issue before starting anything larger, so you don't build something that won't be merged. English and
Chinese are both fine.

## Before you change code

- Set up the project with the [quick start](README.md#quick-start-development). Mobile setup and tests are in
  [mobile/README.md](mobile/README.md).
- Read [CONTEXT.md](CONTEXT.md) and the related [decision records](docs/adr/) before changing ledger or capture
  behavior. If your change contradicts one, say so in the pull request.
- User-facing text needs English and Chinese. See [docs/i18n.md](docs/i18n.md).

## Never include personal data

Payment pages, statements, and capture logs contain private information. In issues, pull requests, tests,
comments, and documents, use made-up amounts, shops, goods, names, card numbers, and order numbers, and leave out
the time of day of real payments, IP addresses, and device identifiers. Keep the structure of a page and replace
its contents.

## Checks

Run what your change touches:

| Changed | Command |
| --- | --- |
| Anything in `src/` or `scripts/` | `npm run lint && npm run typecheck && npm test` |
| Web pages or API routes | `npm run test:e2e` |
| Database schema | `npm run db:generate`, and commit the migration |
| Flutter code | `npm run test:mobile:quick` |
| Mobile API | `npm run test:mobile:contract` |
| Android capture (Kotlin) | `cd mobile/android && ./gradlew :app:testDebugUnitTest` |

Golden images are compared on macOS only, and only macOS may update them.

If you install through a registry mirror, the mirror's address ends up in `package-lock.json` or
`mobile/pubspec.lock`, and `npm test` fails. Replace it with `https://registry.npmjs.org` or `https://pub.dev`
before committing.

## Pull requests

- One topic per pull request, with a test for every bug fix.
- Link the issue: `Closes #12` when merging finishes it, `Part of #12` when it doesn't.
- For a visual change, attach screenshots made from sample data.

Report security problems as described in [SECURITY.md](SECURITY.md), not in an issue.

By contributing you agree that your work is released under the [MIT license](LICENSE).
