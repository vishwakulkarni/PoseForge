# Metrics reference

The Metrics page summarizes the `generations` stored in the local
database. It does not query provider billing systems.

## Scopes

- **Historical** includes every stored generation.
- **Session** includes generations created since the current API process
  started. Restarting the API starts a new session window; it does not delete
  historical rows.

Refresh reloads the selected scope. JSON and CSV export use that same scope.

## KPI definitions

- **Lifetime spend** is the sum of actual provider cost when present, otherwise
  PoseForge's pre-run estimate. Local ComfyUI and local document formatting
  contribute $0 in provider charges.
- **Tokens used** is `totalTokens`, or input plus output tokens when a total was
  not recorded. Token counts may be estimated for engines that do not return
  usage.
- **Success rate** is completed runs divided by all terminal runs. Queued or
  running jobs are excluded from the denominator.
- **Median latency** measures engine execution from generation start to finish.
- **P95 latency** is the 95th-percentile execution duration.
- **Queue wait** measures time between request creation and engine start.

## Recorded and estimated values

Each generation stores a `usage_metrics` object. Its `source` can be:

- `actual`: the engine returned provider usage.
- `estimated`: PoseForge calculated usage before the run using dated rates.
- `partial`: some values are provider-reported and others are estimated.
- `local`: no provider token or API charge was incurred.

When both `actualCostUsd` and `estimatedCostUsd` exist, Metrics uses the actual
cost, including an actual value of zero. Antigravity and Codex plan costs may be
shown as undisclosed because their CLIs do not expose a per-run dollar amount.
Electricity, hardware, subscriptions, taxes, and provider volume discounts are
not included.

The **recorded usage** percentage shows how many rows contain provider-reported
usage rather than an estimate. Treat totals as directional whenever that share
is below 100%.

## Charts and breakdowns

The trend chart can group by day, week, month, or individual run and switch
between tokens and cost. Series are separated by engine and use cumulative
totals for time buckets.

The engine table groups records by engine and model. It reports run count,
success rate, tokens, cost, latency, and failure information. A missing model
means the engine did not record one for that run.

Failure reasons are normalized into groups so repeated provider or validation
errors can be compared without exposing secrets or full prompts.

## Export fields

JSON preserves the complete metrics response. CSV contains the flattened
engine/model breakdown for spreadsheet analysis. Filenames include the current
scope and export date.

Exports can contain operational metadata such as engine names, models, errors,
and costs. Review a file before sharing it outside your machine.
