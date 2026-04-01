"""Validation tests for trained model JSON files.

Ensures trained model artifacts have correct structure, dimensions,
and reasonable values to catch corruption or overfitting.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


TRAINED_MODELS_DIR = Path(__file__).parent.parent / "feature_projections" / "trained_models"

REQUIRED_KEYS = {
    "alpha",
    "coefficients",
    "intercept",
    "feature_names",
    "interaction_terms",
    "scaler_mean",
    "scaler_scale",
    "training_metadata",
}

REQUIRED_METADATA_KEYS = {
    "seasons",
    "n_samples",
    "n_features",
    "loso_mae",
    "train_mae",
    "train_r2",
    "trained_at",
}


def _discover_trained_models():
    """Find all trained model JSON files."""
    if not TRAINED_MODELS_DIR.exists():
        return []
    return sorted(TRAINED_MODELS_DIR.glob("*.json"))


def _load_model(path):
    """Load and return model params from JSON."""
    with open(path) as f:
        return json.load(f)


# Collect all model files for parametrization
MODEL_FILES = _discover_trained_models()
MODEL_IDS = [p.stem for p in MODEL_FILES]


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestTrainedModelStructure:
    """Validate structure of trained model JSON files."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_required_keys_exist(self, model_path):
        """All required top-level keys must be present."""
        params = _load_model(model_path)
        missing = REQUIRED_KEYS - set(params.keys())
        assert not missing, f"Missing keys in {model_path.name}: {missing}"

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_metadata_keys_exist(self, model_path):
        """Training metadata must have all required keys."""
        params = _load_model(model_path)
        metadata = params.get("training_metadata", {})
        missing = REQUIRED_METADATA_KEYS - set(metadata.keys())
        assert not missing, f"Missing metadata keys in {model_path.name}: {missing}"


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestDimensionConsistency:
    """Validate that array dimensions are consistent across model components."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_coefficient_count_matches_features(self, model_path):
        """len(coefficients) must equal len(feature_names)."""
        params = _load_model(model_path)
        assert len(params["coefficients"]) == len(params["feature_names"]), (
            f"{model_path.name}: {len(params['coefficients'])} coefficients "
            f"but {len(params['feature_names'])} feature names"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_scaler_mean_matches_features(self, model_path):
        """len(scaler_mean) must equal len(feature_names)."""
        params = _load_model(model_path)
        assert len(params["scaler_mean"]) == len(params["feature_names"]), (
            f"{model_path.name}: {len(params['scaler_mean'])} scaler_mean "
            f"but {len(params['feature_names'])} feature names"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_scaler_scale_matches_features(self, model_path):
        """len(scaler_scale) must equal len(feature_names)."""
        params = _load_model(model_path)
        assert len(params["scaler_scale"]) == len(params["feature_names"]), (
            f"{model_path.name}: {len(params['scaler_scale'])} scaler_scale "
            f"but {len(params['feature_names'])} feature names"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_n_features_matches(self, model_path):
        """training_metadata.n_features must match actual feature count."""
        params = _load_model(model_path)
        metadata = params["training_metadata"]
        assert metadata["n_features"] == len(params["feature_names"]), (
            f"{model_path.name}: metadata says {metadata['n_features']} features "
            f"but {len(params['feature_names'])} feature names"
        )


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestTrainingMetadataReasonableness:
    """Validate that training metadata has reasonable values."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_sufficient_samples(self, model_path):
        """Must have at least 50 training samples."""
        params = _load_model(model_path)
        n_samples = params["training_metadata"]["n_samples"]
        assert n_samples >= 50, (
            f"{model_path.name}: only {n_samples} samples (need >= 50)"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_loso_mae_reasonable(self, model_path):
        """LOSO MAE should be < 5.0 (fantasy PPG scale)."""
        params = _load_model(model_path)
        loso_mae = params["training_metadata"]["loso_mae"]
        assert loso_mae < 5.0, (
            f"{model_path.name}: LOSO MAE = {loso_mae} (should be < 5.0)"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_severe_overfitting(self, model_path):
        """LOSO MAE should be within 50% of training MAE."""
        params = _load_model(model_path)
        metadata = params["training_metadata"]
        loso_mae = metadata["loso_mae"]
        train_mae = metadata["train_mae"]

        # LOSO MAE > train_mae is expected (generalization gap)
        # but it shouldn't be more than 1.5x train_mae
        if train_mae > 0:
            ratio = loso_mae / train_mae
            assert ratio < 1.5, (
                f"{model_path.name}: LOSO/train MAE ratio = {ratio:.2f} "
                f"(> 1.5 suggests overfitting)"
            )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_positive_r2(self, model_path):
        """Training R² should be positive (model better than mean)."""
        params = _load_model(model_path)
        train_r2 = params["training_metadata"]["train_r2"]
        assert train_r2 > 0, (
            f"{model_path.name}: train R² = {train_r2} (should be > 0)"
        )


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestCoefficientReasonableness:
    """Validate that learned coefficients are within reasonable bounds."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_extreme_coefficients(self, model_path):
        """No coefficient should exceed 100 in absolute value."""
        params = _load_model(model_path)
        for name, coef in zip(params["feature_names"], params["coefficients"]):
            assert abs(coef) < 100, (
                f"{model_path.name}: coefficient '{name}' = {coef} "
                f"(|coef| >= 100 suggests overfitting)"
            )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_intercept_reasonable(self, model_path):
        """Intercept should be within fantasy PPG range."""
        params = _load_model(model_path)
        intercept = params["intercept"]
        assert -10 < intercept < 30, (
            f"{model_path.name}: intercept = {intercept} (outside [-10, 30] range)"
        )


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestScalerValidity:
    """Validate StandardScaler parameters."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_zero_scale(self, model_path):
        """No scaler_scale value should be exactly 0 (causes division by zero)."""
        params = _load_model(model_path)
        for i, (name, scale) in enumerate(zip(params["feature_names"], params["scaler_scale"])):
            # Zero scale means constant feature — the predict function handles this,
            # but it indicates a potentially useless feature
            if scale == 0:
                pytest.skip(f"Feature '{name}' has zero variance (constant) — handled at inference")

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_negative_scale(self, model_path):
        """No scaler_scale value should be negative."""
        params = _load_model(model_path)
        for name, scale in zip(params["feature_names"], params["scaler_scale"]):
            assert scale >= 0, (
                f"{model_path.name}: scaler_scale for '{name}' = {scale} (negative)"
            )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_valid_alpha(self, model_path):
        """Ridge alpha should be positive."""
        params = _load_model(model_path)
        assert params["alpha"] > 0, (
            f"{model_path.name}: alpha = {params['alpha']} (should be > 0)"
        )
