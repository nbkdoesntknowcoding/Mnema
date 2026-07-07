# Governance

Stated plainly, so nothing surprises you: **Mnema is a company-led, open-core
project.** It is built and maintained by **BOPPL** (The Boring People), and it
runs on a BDFL model — the **final decision on any change, direction, or release
rests with the lead maintainer**, [@nbkdoesntknowcoding](https://github.com/nbkdoesntknowcoding).
See [MAINTAINERS.md](./MAINTAINERS.md).

This is not community-governed by committee, and we won't pretend otherwise.
There's no steering council, no voting, no RFC process. What there *is*: an open
core you can read, run, fork, and improve — and a maintainer who reviews every
contribution and is accountable for what ships.

## How decisions get made

- **Direction and scope** are set by the maintainer. Some capabilities live in
  the open core; others (knowledge graph, meeting intelligence, org/IAM+SSO,
  audit, multi-workspace) are commercial add-ons in a separate repository. Where
  a feature belongs is a maintainer call — see the core/enterprise boundary in
  [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Contributions are welcome and genuinely wanted**, under the terms in
  [CONTRIBUTING.md](./CONTRIBUTING.md): one logical change per PR, DCO sign-off,
  and the contribution-license grant that lets the project offer the same code
  under both the Community License and a commercial license. The maintainer
  reviews, may ask for rework, and decides what lands.
- **Releases** are cut by the maintainer as annotated, signed tags on `main`.
  See [RELEASING.md](./RELEASING.md).

## What this means for you

- You can rely on the core being open and self-hostable under the
  [Mnema Community License](./LICENSE), forever.
- You can propose and contribute changes, and be credited for what's accepted.
- You should not expect a vote or veto over project direction — that's the
  maintainer's call. If a direction doesn't suit you, the license lets you fork
  (the name and logo stay with the project — see [TRADEMARK.md](./TRADEMARK.md)).

## Becoming a maintainer

Additional maintainers may be added over time, at the lead maintainer's
discretion, based on sustained and trusted contribution. There's no fixed
checklist; it's earned. If you're interested, open an issue or reach out.

## Code of conduct

Everyone participating in the project is expected to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).
