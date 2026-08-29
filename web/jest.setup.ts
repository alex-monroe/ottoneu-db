import '@testing-library/jest-dom'

/**
 * Deterministic Math.random for every test.
 *
 * The draft engines jitter their behaviour with Math.random (lognormalNoise,
 * positional taste, bid timing). That is correct in production, but it turns
 * every distributional assertion in the test suite into a dice roll: three
 * separate tests across mock-draft-engine, snake-draft-engine and
 * mock-draft-live were failing on roughly one CI run in six, reddening PRs that
 * had not touched any of that code.
 *
 * Reseeding before each test makes those suites reproducible while keeping the
 * values varied *within* a test, so the properties they assert — ordering is
 * jittered but value-weighted, positional runs stay draft-like, an auto-bid
 * answers with the minimum raise — are still genuinely exercised.
 *
 * A test that deliberately wants different draws can still install its own
 * generator; this only sets the starting point.
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TEST_SEED = 0x5eed;
const originalRandom = Math.random;

beforeEach(() => {
    Math.random = mulberry32(TEST_SEED);
});

afterEach(() => {
    Math.random = originalRandom;
});
