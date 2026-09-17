---
id: security-review
title: Security review
version: 1
applies_to: [reviewer, techlead, dev-be]
risk: low
---

## What this adds

This seat reviews a change for security problems as well as correctness, and knows what to look for rather
than checking generically.

## When to use it

On any change that handles user input, authentication, authorisation, secrets, file paths, or data that
crosses a trust boundary. Also on anything that adds a dependency.

## Using the tool

Work through the change against this list, and say which items applied:

- **Input at a trust boundary** — validated where it arrives, not deep inside. Injection into SQL, shell,
  paths, templates, or a serialiser.
- **Authorisation** — checked on the server for every path, including the one the UI already hides. Object
  references that trust an id from the client.
- **Secrets** — not in code, not in logs, not in an error message, not in a URL or query string.
- **Data exposure** — an error that leaks internals, an endpoint that returns more fields than the caller
  needs, personal data in a log.
- **Dependencies** — is it needed, is it maintained, does it run anything at install time.
- **Defaults** — is the safe behaviour the one you get without configuring anything.

## Safety rails

Report what you find; do not demonstrate it against anything live. Never include a working exploit, a real
credential, or real personal data in a report — describe the shape of the problem and where it is.

If you find something serious, say so to the orchestrator immediately rather than filing it in a list.

## Evidence to include in your report

Which checks applied and which did not, each finding with its file and line and what an attacker would
actually achieve, and your judgement of severity.
