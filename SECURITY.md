# Security policy

Zowl holds financial records and, on Android, runs an accessibility service that can read the screen. Reports
about either are welcome.

## Reporting a vulnerability

Please do not open a public issue. Use **Security → Report a vulnerability** on the
[GitHub repository](https://github.com/lalaze/Zowl/security) to report it privately.

Include the version or commit, how to reproduce it, and what an attacker gains. Use made-up data: leave out real
transactions, account numbers, server addresses, tokens, and capture logs.

Zowl is maintained by one person in spare time, so there is no guaranteed response time.

## Supported versions

Fixes go to `main` only. There are no maintained release branches, so update to the latest commit before
reporting.

## What is in scope

- Reading or changing another user's data on the same server.
- Getting past sign-in, the initial administrator setup, or session revocation.
- Posting, editing, or removing a transaction without the confirmation the
  [decision records](docs/adr/) require.
- Page text, screenshots, or credentials leaving the phone or the server in a way the
  [privacy section](README.md#privacy) rules out.
- Reading uploaded statements, screenshots, or saved API keys without permission.

Out of scope: a compromised phone or server, a server exposed without HTTPS, and missed or wrong captures. For
missed captures, open a regular issue.
