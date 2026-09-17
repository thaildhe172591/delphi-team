---
id: api-contract
title: API contract ownership
version: 1
applies_to: [techlead, dev-be]
risk: low
---

## What this adds

This seat may define and change the API contracts other seats build against: request and response shapes,
status codes, error bodies, pagination, versioning and events.

## When to use it

Before any work that adds an endpoint, changes a response, or changes what an error looks like.

## Using the tool

Write the contract in `docs/arch/contracts/<name>.md` before the implementation exists, so the frontend and
the backend can start from the same document rather than from each other.

For each endpoint state: method and path, request shape, success response with its status, every error
response with its status and body, and what is optional versus required. Include one worked example of each.

## Safety rails

A contract that has shipped is a promise. Changing it breaks whoever built against it.

- An additive change — a new optional field, a new endpoint — is fine. Say so in the report.
- A breaking change — removing or renaming a field, changing a type, changing a status code — needs the seats
  that consume it named in your message, and needs a version or a migration path.
- Never change a contract to make an implementation convenient. Change the implementation, or change the
  contract deliberately and tell everyone.

## Evidence to include in your report

The contract file you wrote, which endpoints changed, whether each change is additive or breaking, and the
seats that build against it.
