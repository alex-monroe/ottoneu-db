import pandas as pd
import numpy as np
import time

def run_benchmark():
    # Generate large synthetic data
    N = 100_000
    np.random.seed(42)
    df = pd.DataFrame({
        'price': np.random.randint(1, 100, N).astype(float),
        'pps': np.abs(np.random.normal(10, 5, N)) # Mostly positive
    })

    # Introduce exactly 0.0 PPS
    # Ensure some are exactly 0.0 to test the condition
    zero_indices = np.random.choice(df.index, size=int(N * 0.05), replace=False)
    df.loc[zero_indices, 'pps'] = 0.0

    # Baseline: current apply implementation
    print("Running baseline (apply)...")
    start_time = time.perf_counter()
    # Replicating the logic from the original file exactly
    # lambda row: row['price'] / row['pps'] if row['pps'] > 0 else 9999.0
    res_apply = df.apply(
        lambda row: row['price'] / row['pps'] if row['pps'] > 0 else 9999.0, axis=1
    )
    end_time = time.perf_counter()
    baseline_time = end_time - start_time
    print(f"Baseline (apply): {baseline_time:.6f} seconds")

    # Optimization: vectorized implementation with np.where
    print("Running optimized (np.where)...")
    start_time = time.perf_counter()

    # Vectorized approach:
    # We want to avoid DivisionByZero warning.
    # Approach 1: Masking (safe and fast)
    # result = pd.Series(9999.0, index=df.index)
    # mask = df['pps'] > 0
    # result[mask] = df.loc[mask, 'price'] / df.loc[mask, 'pps']

    # Approach 2: np.where with suppressed warnings (often faster)
    with np.errstate(divide='ignore', invalid='ignore'):
        # This will compute division for all, resulting in inf for 0s,
        # but then np.where selects 9999.0 for those cases.
        res_vec = np.where(
            df['pps'] > 0,
            df['price'] / df['pps'],
            9999.0
        )

    end_time = time.perf_counter()
    optimized_time = end_time - start_time
    print(f"Optimized (np.where): {optimized_time:.6f} seconds")

    # Verify correctness
    # Convert res_vec to Series to compare with res_apply
    res_vec_series = pd.Series(res_vec, index=df.index)

    # Check for NaNs (shouldn't be any if logic is correct)
    if res_vec_series.isna().any():
        print("Verification FAILED: Found NaNs in result")
        return

    # Compare
    # Using np.isclose for float comparison
    matches = np.isclose(res_apply, res_vec_series, equal_nan=True)
    if matches.all():
        print("Verification: PASSED (Results match)")
    else:
        print("Verification: FAILED (Results differ)")
        mismatches = ~matches
        print(f"Count mismatch: {mismatches.sum()}")
        print("First 5 mismatches:")
        print(pd.DataFrame({
            'pps': df.loc[mismatches, 'pps'],
            'price': df.loc[mismatches, 'price'],
            'apply': res_apply[mismatches],
            'vec': res_vec_series[mismatches]
        }).head())

    print(f"Speedup: {baseline_time / optimized_time:.2f}x")

if __name__ == "__main__":
    run_benchmark()
