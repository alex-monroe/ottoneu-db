
## 2025-03-27 - Remove chaining array methods in surplus calculations
**Learning:** Found multiple usages of `.filter().reduce()` for calculating `totalPositiveVorp` in `web/lib/surplus.ts`. Such operations introduce O(2N) runtime iterations and intermediate array allocations.
**Action:** Replaced them with single-pass `for` loops in hot paths to eliminate these allocations and reduce CPU overhead. This pattern should be standard for critical performance hotpaths in Javascript/Typescript.
