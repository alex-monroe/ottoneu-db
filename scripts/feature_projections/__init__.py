"""Feature-based player projection system.

Provides an iterative framework for building PPG projections from composable
features. Each feature computes a PPG-scale value (absolute or delta), and a
combiner aggregates them into a final projection.
"""
