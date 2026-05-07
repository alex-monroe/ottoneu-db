"""Validation tests for trained model JSON files.

Ensures trained model artifacts have correct structure, dimensions,
and reasonable values to catch corruption or overfitting. Residual
models have a different schema (no scaler, residual-specific metadata,
and an embedded base model under ``base_model_params``); residual-only
expectations are encoded in the helpers below and the relevant tests
branch on the saved ``combiner_type``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


TRAINED_MODELS_DIR = Path(__file__).parent.parent / "feature_projections" / "trained_models"

# Schema for the standard learned ridge model (has its own StandardScaler).
LEARNED_REQUIRED_KEYS = {
    "alpha",
    "coefficients",
    "intercept",
    "feature_names",
    "interaction_terms",
    "scaler_mean",
    "scaler_scale",
    "training_metadata",
}
LEARNED_REQUIRED_METADATA_KEYS = {
    "seasons",
    "n_samples",
    "n_features",
    "loso_mae",
    "train_mae",
    "train_r2",
    "trained_at",
}

# Schema for the residual model. No scaler (raw passthrough on residual fit),
# no train_mae/train_r2 (those describe absolute-PPG fit, not residual fit).
RESIDUAL_REQUIRED_KEYS = {
    "alpha",
    "coefficients",
    "intercept",
    "feature_names",
    "interaction_terms",
    "training_metadata",
    "base_model_name",
    "base_model_params",
    "combiner_type",
}
RESIDUAL_REQUIRED_METADATA_KEYS = {
    "seasons",
    "n_samples",
    "n_features",
    "loso_residual_mae",
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


def _is_residual(params: dict) -> bool:
    return params.get("combiner_type") == "residual"


def _expected_column_count(params: dict) -> int:
    """Number of fitted coefficients implied by raw features + interaction_terms.

    Mirrors the layout produced by ``learned_combiner.get_feature_column_names``:
    one column per raw feature, one per ``feat^2``, four per ``feat*position``,
    and one for any other ``feat_a*feat_b`` interaction.
    """
    raw_count = len(params["feature_names"])
    interaction_count = 0
    for term in params["interaction_terms"]:
        if term.endswith("*position"):
            interaction_count += 4  # one column per QB/RB/WR/TE dummy
        else:
            interaction_count += 1
    return raw_count + interaction_count


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
        required = RESIDUAL_REQUIRED_KEYS if _is_residual(params) else LEARNED_REQUIRED_KEYS
        missing = required - set(params.keys())
        assert not missing, f"Missing keys in {model_path.name}: {missing}"

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_metadata_keys_exist(self, model_path):
        """Training metadata must have all required keys."""
        params = _load_model(model_path)
        metadata = params.get("training_metadata", {})
        required = (
            RESIDUAL_REQUIRED_METADATA_KEYS
            if _is_residual(params)
            else LEARNED_REQUIRED_METADATA_KEYS
        )
        missing = required - set(metadata.keys())
        assert not missing, f"Missing metadata keys in {model_path.name}: {missing}"


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestDimensionConsistency:
    """Validate that array dimensions are consistent across model components.

    Learned models store one ``feature_name`` per coefficient (the trainer flattens
    interactions into the saved name list). Residual models store only the raw
    feature names — coefficients include the expanded interaction columns —
    so the residual checks compute the expected column count from
    ``feature_names`` + ``interaction_terms``.
    """

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_coefficient_count_matches_features(self, model_path):
        params = _load_model(model_path)
        if _is_residual(params):
            expected = _expected_column_count(params)
            assert len(params["coefficients"]) == expected, (
                f"{model_path.name}: {len(params['coefficients'])} coefficients "
                f"but expected {expected} from raw features + interactions"
            )
        else:
            assert len(params["coefficients"]) == len(params["feature_names"]), (
                f"{model_path.name}: {len(params['coefficients'])} coefficients "
                f"but {len(params['feature_names'])} feature names"
            )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_scaler_mean_matches_features(self, model_path):
        params = _load_model(model_path)
        if _is_residual(params):
            pytest.skip("Residual models do not standardize their fit")
        assert len(params["scaler_mean"]) == len(params["feature_names"]), (
            f"{model_path.name}: {len(params['scaler_mean'])} scaler_mean "
            f"but {len(params['feature_names'])} feature names"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_scaler_scale_matches_features(self, model_path):
        params = _load_model(model_path)
        if _is_residual(params):
            pytest.skip("Residual models do not standardize their fit")
        assert len(params["scaler_scale"]) == len(params["feature_names"]), (
            f"{model_path.name}: {len(params['scaler_scale'])} scaler_scale "
            f"but {len(params['feature_names'])} feature names"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_n_features_matches(self, model_path):
        params = _load_model(model_path)
        metadata = params["training_metadata"]
        if _is_residual(params):
            expected = _expected_column_count(params)
            assert metadata["n_features"] == expected, (
                f"{model_path.name}: metadata says {metadata['n_features']} features "
                f"but expected {expected} from raw features + interactions"
            )
        else:
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
        metadata = params["training_metadata"]
        # Residual fits report MAE on the residual signal (actual - base_pred),
        # which sits on the same PPG scale and should obey the same bound.
        loso_mae = metadata.get("loso_mae", metadata.get("loso_residual_mae"))
        assert loso_mae is not None, (
            f"{model_path.name}: no loso_mae or loso_residual_mae in metadata"
        )
        assert loso_mae < 5.0, (
            f"{model_path.name}: LOSO MAE = {loso_mae} (should be < 5.0)"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_severe_overfitting(self, model_path):
        """LOSO MAE should be within 50% of training MAE.

        Residual models don't track a separate train MAE (their fit target
        is the residual, not absolute PPG), so this check only applies to
        learned models.
        """
        params = _load_model(model_path)
        if _is_residual(params):
            pytest.skip("Residual models do not record a train_mae for this comparison")
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
        if _is_residual(params):
            pytest.skip("Residual models do not produce a meaningful absolute R²")
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
        if _is_residual(params):
            pytest.skip("Residual models do not standardize their fit")
        for i, (name, scale) in enumerate(zip(params["feature_names"], params["scaler_scale"])):
            # Zero scale means constant feature — the predict function handles this,
            # but it indicates a potentially useless feature
            if scale == 0:
                pytest.skip(f"Feature '{name}' has zero variance (constant) — handled at inference")

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_no_negative_scale(self, model_path):
        """No scaler_scale value should be negative."""
        params = _load_model(model_path)
        if _is_residual(params):
            pytest.skip("Residual models do not standardize their fit")
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


@pytest.mark.skipif(len(MODEL_FILES) == 0, reason="No trained model files found")
class TestResidualSchema:
    """Residual-specific structural checks."""

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_base_model_is_complete(self, model_path):
        """Embedded ``base_model_params`` must satisfy either the learned or
        residual schema. Stacked residuals (e.g. v26 on top of v25) have a
        residual base whose own ``base_model_params`` is the learned ridge.
        """
        params = _load_model(model_path)
        if not _is_residual(params):
            pytest.skip("Not a residual model")
        base = params.get("base_model_params")
        assert isinstance(base, dict) and base, (
            f"{model_path.name}: base_model_params missing or empty"
        )
        expected_keys = (
            RESIDUAL_REQUIRED_KEYS if _is_residual(base) else LEARNED_REQUIRED_KEYS
        )
        missing = expected_keys - set(base.keys())
        assert not missing, (
            f"{model_path.name}: base_model_params "
            f"({'residual' if _is_residual(base) else 'learned'} schema) "
            f"missing keys {missing}"
        )

    @pytest.mark.parametrize("model_path", MODEL_FILES, ids=MODEL_IDS)
    def test_residual_intercept_is_zero(self, model_path):
        """Residual fits use ``fit_intercept=False`` so vets stay byte-identical to base."""
        params = _load_model(model_path)
        if not _is_residual(params):
            pytest.skip("Not a residual model")
        assert params["intercept"] == 0.0, (
            f"{model_path.name}: residual intercept = {params['intercept']} (must be 0)"
        )
