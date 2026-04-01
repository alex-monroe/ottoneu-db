"""Cross-model consistency tests.

Verifies expected relationships between models: structural validity,
feature registry coverage, baseline existence, and known equivalences.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.feature_projections.model_config import MODELS, ModelDefinition
from scripts.feature_projections.features import FEATURE_REGISTRY


TRAINED_MODELS_DIR = Path(__file__).parent.parent / "feature_projections" / "trained_models"


# ---------------------------------------------------------------------------
# Model Config Completeness
# ---------------------------------------------------------------------------

class TestModelConfigCompleteness:
    """Every model must have valid name, version, description, and features."""

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_has_name(self, model_name):
        model = MODELS[model_name]
        assert model.name, f"Model '{model_name}' has no name"
        assert model.name == model_name, (
            f"Model key '{model_name}' doesn't match model.name '{model.name}'"
        )

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_has_version(self, model_name):
        model = MODELS[model_name]
        assert model.version >= 1, f"Model '{model_name}' has invalid version {model.version}"

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_has_description(self, model_name):
        model = MODELS[model_name]
        assert model.description, f"Model '{model_name}' has no description"
        assert len(model.description) > 10, (
            f"Model '{model_name}' description too short: '{model.description}'"
        )

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_has_features(self, model_name):
        model = MODELS[model_name]
        assert len(model.features) >= 1, f"Model '{model_name}' has no features"


# ---------------------------------------------------------------------------
# Feature Registry Coverage
# ---------------------------------------------------------------------------

class TestFeatureRegistryCoverage:
    """Every feature referenced by a model must exist in the registry."""

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_features_in_registry(self, model_name):
        model = MODELS[model_name]
        # Skip external models
        if model.features == ["external"]:
            pytest.skip("External model, no feature registry check needed")

        for feat in model.features:
            assert feat in FEATURE_REGISTRY, (
                f"Model '{model_name}' references feature '{feat}' "
                f"not found in FEATURE_REGISTRY"
            )

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_override_features_in_registry(self, model_name):
        """Position override features must also be in the registry."""
        model = MODELS[model_name]
        for pos, override in model.position_overrides.items():
            for feat in override.features:
                assert feat in FEATURE_REGISTRY, (
                    f"Model '{model_name}' position override for {pos} "
                    f"references feature '{feat}' not in FEATURE_REGISTRY"
                )


# ---------------------------------------------------------------------------
# Baseline Model
# ---------------------------------------------------------------------------

class TestBaseline:
    """Exactly one model should be the baseline."""

    def test_exactly_one_baseline(self):
        baselines = [name for name, m in MODELS.items() if m.is_baseline]
        assert len(baselines) == 1, (
            f"Expected exactly 1 baseline model, found {len(baselines)}: {baselines}"
        )

    def test_baseline_is_v1(self):
        baselines = [name for name, m in MODELS.items() if m.is_baseline]
        assert baselines[0] == "v1_baseline_weighted_ppg", (
            f"Baseline should be v1, found: {baselines[0]}"
        )


# ---------------------------------------------------------------------------
# Learned Models
# ---------------------------------------------------------------------------

class TestLearnedModels:
    """Learned models must have a trained JSON file."""

    def _get_learned_models(self):
        return [
            (name, m) for name, m in MODELS.items()
            if m.combiner_type == "learned"
        ]

    def test_learned_models_have_trained_file(self):
        """Every learned model must have a corresponding JSON in trained_models/."""
        for name, model in self._get_learned_models():
            path = TRAINED_MODELS_DIR / f"{name}.json"
            assert path.exists(), (
                f"Learned model '{name}' has no trained model file at {path}"
            )

    def test_learned_models_have_interaction_terms(self):
        """Learned models should specify interaction terms."""
        for name, model in self._get_learned_models():
            assert len(model.interaction_terms) > 0, (
                f"Learned model '{name}' has no interaction_terms specified"
            )


# ---------------------------------------------------------------------------
# No Duplicates
# ---------------------------------------------------------------------------

class TestNoDuplicates:
    """Model configurations should not have internal duplicates."""

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_no_duplicate_features(self, model_name):
        """No model should list the same feature twice."""
        model = MODELS[model_name]
        assert len(model.features) == len(set(model.features)), (
            f"Model '{model_name}' has duplicate features: {model.features}"
        )

    def test_all_model_names_unique(self):
        """All model names are unique (dict keys enforce this, but verify names match keys)."""
        names = [m.name for m in MODELS.values()]
        assert len(names) == len(set(names)), (
            f"Duplicate model names found: {[n for n in names if names.count(n) > 1]}"
        )


# ---------------------------------------------------------------------------
# Known Equivalences
# ---------------------------------------------------------------------------

class TestKnownEquivalences:
    """Models that are documented as equivalent should have the same features."""

    def test_v8_v9_same_features(self):
        """v8 and v9 were confirmed to have equivalent features."""
        v8 = MODELS.get("v8_age_regression")
        v9 = MODELS.get("v9_pos_specific")

        if v8 is None or v9 is None:
            pytest.skip("v8 or v9 not found in MODELS")

        assert sorted(v8.features) == sorted(v9.features), (
            f"v8 features {v8.features} != v9 features {v9.features}"
        )


# ---------------------------------------------------------------------------
# Combiner Type Validity
# ---------------------------------------------------------------------------

class TestCombinerType:
    """Combiner type must be one of the valid options."""

    VALID_COMBINER_TYPES = {"additive", "learned"}

    @pytest.mark.parametrize("model_name", list(MODELS.keys()))
    def test_valid_combiner_type(self, model_name):
        model = MODELS[model_name]
        assert model.combiner_type in self.VALID_COMBINER_TYPES, (
            f"Model '{model_name}' has invalid combiner_type '{model.combiner_type}'"
        )
