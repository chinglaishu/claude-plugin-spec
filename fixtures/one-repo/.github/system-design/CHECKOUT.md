---
slug: checkout-spec
title: Checkout
entrypoint: true
governs:
  - src/checkout.ts
requirements:
  - id: REQ-FX-1
    text: An order totals the sum of its line items.
    covers: [checkout-happy-path]
  - id: REQ-FX-2
    text: A voucher never takes the total below zero.
---

## Totals

REQ-FX-1 defines the total. REQ-FX-2 bounds it: REQ-FX-2 is deliberately left without a covering
test, so the fixture pins the `uncovered-requirement` issue.
