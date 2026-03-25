## 2024-03-25 - Replace Array Chaining with Loops
**Learning:** In hot paths calculating metrics or surplus, chained array methods like `.filter().reduce()` introduce intermediate array allocations and O(N) iteration overhead, scaling poorly in performance.
**Action:** Replace them with single-pass `for` loops to eliminate the overhead.
