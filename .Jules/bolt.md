## 2025-02-12 - [Arbitration Simulation Hot Loop Optimization]
**Learning:** In highly-nested Monte Carlo simulations (like `runArbitrationSimulation`), utilizing JS array methods (`.filter()`, `.reduce()`, `.entries()`) inside the inner loops causes immense garbage collection pressure and O(N^2) bottlenecks. Specifically, recalculating allocations using `Array.from(map.entries()).filter().reduce()` per player, per team, per simulation is devastating for performance.
**Action:** Always pre-calculate lookup Maps and Sets outside the simulation loops, and use mutable accumulator Maps (like `currentToTeamMap`) updated in O(1) time within the loop instead of scanning the full allocations record repeatedly. Use standard `for` loops for large dataset transformations to minimize intermediate array allocations.

## 2025-02-13 - [Frontend Chart Grouping Optimization]
**Learning:** For frontend performance optimizations, avoid filtering large datasets (e.g., `data.filter()`) directly within React render loops or multiple times inside `useMemo` hooks. Pre-calculating or grouping the data into lookup maps in a single pass prevents O(P*N) operations multiplying per render.
**Action:** Use single-pass iterations (like a single `for` loop populating a `Map`) instead of multiple `.filter()` calls to distribute items into categories.

## 2025-03-11 - [Arbitration Planner Allocation Optimization]
**Learning:** Calling `.find()` inside a nested loop when distributing allocations (`web/app/arbitration-planner/ArbPlannerClient.tsx`) results in an O(N^2) operation, which can cause significant UI blocking when dealing with large arrays of players and targets.
**Action:** When finding matching items across two lists inside a loop, pre-calculate an O(1) Map keyed by the search criteria (e.g., `name|team_name`) before the loop begins to avoid redundant array iterations.
