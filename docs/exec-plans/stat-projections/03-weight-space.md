# 03 - Weight-space methods for season-level NFL stat projection

Researcher note: written 2026-11-05. Items marked (verified) were read this session; items marked (from memory) are well-known papers whose URLs are standard arXiv links but were not re-fetched.

## 0. What does "weight space programming" mean?

There is a **literal, very recent** meaning: "Sparks of Weight-Space Programming" (Takehi, Teoh, Zhang, Khattab; MIT CSAIL; blog post dated 2026-11-02). Definition: a general-purpose LLM (GPT-6 "Astra", proprietary) **reads and writes a neural network's weights directly, with no optimizer or gradient descent**. It was given weights as text and/or a Python sandbox over the weights plus a budget of forward passes. (verified, via secondary coverage; the primary blog was not fetched directly.)
Reported results: wrote Atari-style game policies in one shot (Breakout 517 vs 25 for PPO at 500M steps; mixed on Seaquest/Asterix); wrote a 1.5M-param Go net from a 336-line program; fixed a stuck RL car agent (0/256 -> 1024/1024); edited 0.016% of Qwen3.5-0.8B (subtracting a "looping" direction from MLP outputs in layers 15 and 19), MATH-500 7.9% -> 48.1%. Caveats from the authors: it removes obstacles rather than adding ability (Gemma 3 270M gained ~1pt), small targets only (17K to 1.5M weights; one 0.8B LM), proprietary model, not peer reviewed, Schmidhuber called it old hat. Sources: [primary blog](https://rikiyat.github.io/blog/weight-space-programming/), [logs](https://github.com/RikiyaT/lm_understand-logs), [OfficeChai](https://officechai.com/ai/weight-space-programming/), [explainx summary](https://explainx.ai/blog/weight-space-programming-gpt-6-astra-edits-qwen3-5-0-8b-weights-math-7-9-to-48-1-mit-csail-2026), [runtimewire](https://runtimewire.com/article/gpt-6-astra-edits-qwen-weights-weight-space-programming).

Given the timing (published 3 days before this task), **the owner most plausibly means this** ("weight space programming ... where possible" echoes it), possibly blended with the broader weight-space-learning idea. Honest read: the LLM-writes-weights technique is a poor fit for this problem (section 1), but its *spirit* - construct/edit model parameters directly from structural knowledge rather than only fitting by gradient descent - maps to legitimate, cheap techniques: hand-specified priors on regression weights, structured Bayesian linear models, and editing/merging fitted weight vectors (sections 2-3). I recommend the main agent clarify with the owner, but proceed with sections 2-3 experiments.

## 1. Weight-space programming (LLM reads/writes weights) - applicability

Plain explanation: the model is the "programmer", the weights are the "program". Works when (a) the network is small enough to fit in context, (b) the task structure is known and describable (game rules), (c) a failure mode is a localized, identifiable direction.

Applicability here: **weak as a fitting method, mildly useful as an analysis/audit tool.**
- Our data problem is statistical: ~hundreds of noisy player-seasons per position. The signal is in regression to the mean, usage shares, aging curves. No "rules" to write down that beat fitted estimates, and an LLM cannot conjure information not in the data. Their own finding (edits remove obstacles, can't add ability) supports this.
- Our models are tiny (tens of coefficients in a ridge/GBM/small MLP), which *does* fit in context. So an LLM could **read** a fitted coefficient vector and flag pathologies (sign flips, a dead interaction, kicker bias - cf. the project's v44 weight audit bugs). That is an audit, not a model improvement, and a human/diagnostic script does it as well.
- Risk: an LLM "editing" coefficients using held-out feedback is hand-tuning against the evaluation set, i.e. leakage/overfit to the rolling-origin folds. Must only use pre-t data.
- Cheap experiment (low priority): give an LLM the fitted ridge coefficients per position plus feature names and ask for "prior-knowledge" adjustments (e.g. shrink target-share coefficient toward position-wide value); treat the output as a *prior mean* for a Bayesian fit (section 3), evaluate on held-out. Cost: trivial. Expected payoff: low.

## 2. Weight-space learning and editing (ML research sense)

### 2a. Weight-space learning / neural functionals / hypernetworks / model zoos
- Plain: treat trained-network weights as data; equivariant architectures respect neuron-permutation symmetry. Papers: [Navon et al. 2023, Equivariant Architectures for Learning in Deep Weight Spaces](https://arxiv.org/abs/2301.12780) (from memory); [Zhou et al., Permutation Equivariant Neural Functionals](https://arxiv.org/pdf/2302.14040) (verified); [Universal Neural Functionals](https://arxiv.org/abs/2402.05232) (verified); [Survey of Weight Space Learning, 2026](https://arxiv.org/pdf/2603.10090) (verified); [ICML 2026 expressive-power result (Dayan, Eitan, Maron)](https://icml.cc/virtual/2026/poster/62459) (verified); [awesome-weight-space-learning](https://github.com/ege-erdogan/awesome-weight-space-learning).
- Applicability: **poor.** These need thousands of trained networks (model zoos) as the training set. We have a few dozen fold-models at most. The only version resembling our need - predicting a model's weights/performance from earlier ones - is better handled by simple time-series on coefficients (3b).
- Hypernetworks ([Ha et al. 2016](https://arxiv.org/abs/1609.09106), from memory): a net g(context) -> weights of a small regressor. This is the neural analogue of varying-coefficient / hierarchical models, and **is applicable**, in constrained form:
  - Per-player/position coefficient generation: weights w = W0 + W1 * z where z = low-dim context (position, age, draft capital, team pass rate). Linear hypernetwork == interaction terms; nonlinear adds capacity we cannot afford. Use low-rank, heavy weight decay, and shrink to W0. This is equivalent to a hierarchical model with partial pooling; fit it as one.
  - [MotherNet (ICLR 2025)](https://proceedings.iclr.cc/paper_files/paper/2025/file/bed8e95c6a99df485a6fc8b973e2d6cb-Paper-Conference.pdf) (verified via search) and [TabPFN (Nature 2025)](https://ar5iv.labs.arxiv.org/html/2207.01848): pretrained hypernetwork / in-context learner that "generates" a small-data model in a forward pass; competitive with GBMs on small tabular sets without tuning. **Most credible modern "weights from data in one pass" tool at our scale.** TabPFN-MT ([2026 preprint](https://arxiv.org/pdf/2605.20234)) is natively multi-task, which matches the multi-stat chain (attempts, yards, TDs...). Caveat: pretrained on synthetic i.i.d. tables, not panels; must supply lag features manually; row limits ~10K (we are below); license/compute check needed. Note TabPFN is a baseline/ensemble member rather than a "weight-space method" per se.

### 2b. Model merging, task arithmetic, soups, SWA
- Task vectors: [Ilharco et al. 2023, Editing Models with Task Arithmetic](https://arxiv.org/abs/2212.04089); [Model soups, Wortsman 2022](https://arxiv.org/abs/2203.05482); [TIES-Merging](https://arxiv.org/abs/2306.01708); [DARE / Language Models are Super Mario](https://arxiv.org/abs/2311.03099); [SWA, Izmailov 2018](https://arxiv.org/abs/1803.05407); [SWAG](https://arxiv.org/abs/1902.02476); [Linear mode connectivity, Frankle 2020](https://arxiv.org/abs/2002.10365); [Git Re-Basin, Ainsworth 2022](https://arxiv.org/abs/2209.04836) (all from memory).
- Plain: average/add weights of models fine-tuned from a common init; works because fine-tuned solutions lie in a shared flat basin (linear mode connectivity), requiring a common pretrained init.
- Applicability to us, by technique:
  - **Weight averaging of linear/ridge models and small MLPs: trivially valid** (linear models are convex; averaging coefficients = averaging predictions). For MLPs from the same init with small lr, soups/SWA reduce variance cheaply. Equivalent to ensembling, with 1x inference cost. Gain modest; the baseline already ensembles presumably.
  - **Task arithmetic as position/season transfer:** pretrain a shared model on all positions/seasons (the "base"), fine-tune per position -> task vectors tau_pos = w_pos - w_base. Use for (i) shrinkage: w_pos = w_base + lambda * tau_pos with lambda tuned by CV (this is just ridge toward a shared mean - the hierarchical prior again); (ii) rookies/thin-history: w = w_base + tau_pos. Sensible, small data makes lambda<1 almost certainly optimal. The "arithmetic across stat targets" (add targets' vectors) lacks a justification; skip.
  - **Season-drift edit:** tau_drift = w_(t) - w_(t-1) estimated from recent seasons, extrapolate to t+1 (3b).
  - Linear mode connectivity/re-basin: irrelevant at our scale unless using large MLPs; GBMs/ridge have no permutation symmetry.
- Risk: small; mostly reduces to shrinkage + ensembling that the statistics literature already covers. Don't expect big wins, expect variance reduction and rookie-case robustness.

## 3. Weight-space view in Bayesian ML (the highest-value interpretation)

### 3a. Bayesian linear models with structured weight priors
- Rasmussen & Williams, [Gaussian Processes for ML, ch. 2 "Regression" (weight-space view)](https://gaussianprocess.org/gpml/chapters/RW2.pdf): y = x'w + eps, w ~ N(0, Sigma_p); posterior is Gaussian, closed form; function-space view = GP with kernel x'Sigma_p x. Random-feature / basis-function models extend to nonlinearity. (from memory)
- Applicability: **excellent.** n is small, features are few, we want calibrated uncertainty and sharing across positions/stats. Structured priors:
  - Hierarchical (partial pooling) over positions and seasons: w_pos ~ N(w_global, tau^2); coefficient for "target share -> targets" shared with offset per position/team context. Fit with [PyMC](https://www.pymc.io/), [NumPyro](https://num.pyro.ai/), or [brms/Stan](https://mc-stan.org/) (or empirical-Bayes ridge via sklearn `BayesianRidge`/closed form for speed).
  - Matrix-normal prior over the weight matrix W (features x stats): sharing across the stat chain (attempts -> yards -> TDs) with correlated residuals; i.e. multivariate Bayesian regression. Low-rank W (reduced-rank regression) = shared trunk.
  - Aging: coefficients on age basis functions with a random-walk/GP prior (smooth curves per position).
  - Output: predictive distribution => feeds floor/ceiling and VORP uncertainty. Evaluate with log-score/CRPS and interval coverage on held-out, not only RMSE.
  - Zero-inflation/count likelihoods (TDs Poisson/NegBin, games played as binomial with injury-history) in a GLM version.
- Cost: CPU only, seconds-minutes per fold. Risk: low; the main danger is misspecified likelihood (heavy tails, injuries). Include Student-t.

### 3b. Time-varying weights (state-space / dynamic linear model)
- Treat w_t = w_(t-1) + eta_t (Kalman/DLM; [West & Harrison, Bayesian Forecasting and Dynamic Models](https://link.springer.com/book/10.1007/b98971), from memory; also [Bayesian dynamic regression review](https://arxiv.org/abs/1610.01938) not verified). The rolling-origin setup already refits per season; the DLM makes the drift explicit and smooth, handles league-wide shifts (pass-rate rise, rule changes), and weights recent seasons more without a hand-tuned window.
- Concrete: per-season intercept and slope shifts for league-level quantities (pass rate, yards/attempt) with random-walk priors, per-player effects fixed. Equivalent cheaper trick: fit with season-decay sample weights and compare; or model league-level environment features (Vegas totals, league pass rate) as inputs so coefficients stay stable.
- Risk: with 15 seasons, the drift variance is poorly identified; set a strong prior, compare to exponential-decay-weighted ridge. Probably small gain but principled.

### 3c. Bayesian NNs, Laplace, SWAG, deep ensembles
- [Laplace Redux, Daxberger 2021](https://arxiv.org/abs/2106.14806) and the [`laplace-torch`](https://github.com/aleximmer/Laplace) library; SWAG above; [deep ensembles, Lakshminarayanan 2017](https://arxiv.org/abs/1612.01474) (from memory).
- Applicability: **moderate, only if an MLP is used.** Post-hoc Laplace on the last layer of a small multi-task MLP gives cheap uncertainty. For this data, a Bayesian linear/GLM or GBM + quantile/conformal usually matches it. Treat as optional.

### 3d. Multi-task shared-trunk networks (parameter-sharing in weight space)
- Shared trunk with per-stat heads, structurally encoding the stat chain (e.g. attempts -> yards = attempts x ypa). Recommend predicting rates and volume separately (share trunk, multiplicative heads). Reference: [Caruana 1997 multitask](https://link.springer.com/article/10.1023/A:1007379606734) (from memory); [TabPFN-MT](https://arxiv.org/pdf/2605.20234) for a foundation-model version.
- Risk: MLPs on ~1-3K rows per position typically tie or lose to tuned GBM/ridge; use heavy regularization, small width, ensembles/SWA, early stop by inner time-split.

## 4. Ranked experiments (expected payoff for this problem)

1. **Hierarchical Bayesian multi-output regression (3a)**: partial pooling across positions, season random-walk intercepts, matrix-normal/reduced-rank sharing across the stat chain, proper likelihoods per stat, games-played model. Gives calibrated intervals and better thin-history (rookie, 2nd-year) estimates. Tooling: PyMC/NumPyro or closed-form empirical Bayes; CPU. Evaluate: rolling-origin RMSE/MAE vs active model, plus CRPS and 80% interval coverage. Highest payoff, low risk.
2. **Shrinkage-to-shared-weights (task-vector view, 2b) + low-rank linear hypernetwork**: fit global model; per-position/team-context deltas with lambda chosen by inner time-split CV; includes rookie special-case. Essentially cheap version of 1 but usable on top of existing ridge/GBM (stacking). Moderate payoff, very cheap.
3. **Dynamic (time-varying) coefficients (3b)** vs exponential season-decay weights vs fixed window; forecast coefficient trajectory one step ahead. Modest payoff; measures whether drift handling matters. Include league-level covariate approach as control.
4. **TabPFN / TabPFN-MT as a benchmark and ensemble member** (hypernetwork-in-one-pass, 2a): supply lagged features; compare with GBM, and blend. Possible surprise upside on small positions (TE, K, DST-adjacent); needs GPU or slow CPU, check licensing. Moderate payoff, moderate cost.
5. **Weight averaging of per-fold/seed models (SWA/soup) for a small multi-task MLP + last-layer Laplace** (2b/3c). Mostly variance reduction; only meaningful if the redesign includes an MLP. Low-moderate payoff.

Do-not-bother list: neural functionals / weight-space transformers (no model zoo), re-basin, TIES/DARE (for LLMs), LLM-written weights (section 1) as a predictive method. LLM-as-coefficient-auditor is a possible low-cost sanity check only.

## 5. Overfitting/leakage notes specific to this panel
- Any weight "editing", lambda, or drift hyperparameter must be selected with inner time-split (train <= t-2 predict t-1), never on the folds used for reporting.
- Shared-weight methods across seasons must respect that coefficients at fold t only use data <= t-1; stat rates normalized with league-season means computed only from past seasons for the forecast year.
- Fit-quality comparisons with few distinct test seasons (~10-14) have wide uncertainty; use the project's significance harness (paired by player) before promoting.

## Sources
- https://rikiyat.github.io/blog/weight-space-programming/ (primary, not directly fetched; via summaries)
- https://officechai.com/ai/weight-space-programming/
- https://explainx.ai/blog/weight-space-programming-gpt-6-astra-edits-qwen3-5-0-8b-weights-math-7-9-to-48-1-mit-csail-2026
- https://runtimewire.com/article/gpt-6-astra-edits-qwen-weights-weight-space-programming
- https://github.com/RikiyaT/lm_understand-logs
- https://arxiv.org/pdf/2603.10090 ; https://arxiv.org/pdf/2302.14040 ; https://arxiv.org/abs/2402.05232 ; https://icml.cc/virtual/2026/poster/62459 ; https://arxiv.org/abs/2301.12780
- https://proceedings.iclr.cc/paper_files/paper/2025/file/bed8e95c6a99df485a6fc8b973e2d6cb-Paper-Conference.pdf ; https://ar5iv.labs.arxiv.org/html/2207.01848 ; https://arxiv.org/pdf/2605.20234
- https://arxiv.org/abs/2212.04089 ; 2203.05482 ; 2306.01708 ; 2311.03099 ; 1803.05407 ; 1902.02476 ; 2002.10365 ; 2209.04836 ; 1609.09106 ; 2106.14806 ; 1612.01474
- https://gaussianprocess.org/gpml/chapters/RW2.pdf
