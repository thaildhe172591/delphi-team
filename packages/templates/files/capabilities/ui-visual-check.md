---
id: ui-visual-check
title: Visual checking against reference images
version: 1
applies_to: [dev-fe, qa, tester, reviewer]
requires:
  tools: [Read]
risk: low
---

## What this adds

This seat works from screenshots: it reads the reference images a story carries and checks the built result
against them.

## When to use it

Whenever a story has `attachments`, whenever a bug is about how something looks, and whenever the acceptance
criteria describe a layout rather than a behaviour.

## Using the tool

Images live under `.delphi/assets/` and are listed in the story `attachments`. Open them with the Read tool at
those paths — messages between agents carry text only, so a path is how an image travels.

Compare deliberately rather than at a glance:

- The element that the story is actually about.
- Spacing and alignment against the neighbouring elements, not against your memory of the image.
- Text: the exact wording, including punctuation and capitalisation.
- State: is the image showing empty, loading, error, or a full list. Check the others too.
- Width: check the narrow layout as well, unless the story says otherwise.

## Safety rails

A screenshot shows one state, on one screen size, with one set of data. It is evidence, not a specification.
Where the image and the acceptance criteria disagree, say so and ask — do not silently pick one.

If the image shows real customer data, do not copy it into a report or a test fixture.

## Evidence to include in your report

Which images you compared against, what matched, what did not, and which states and widths you checked. If
you produced a new screenshot, save it with `delphi snap` and reference the path.
