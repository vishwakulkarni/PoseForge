# S11-S12 — RunPod Serverless

Official sources:

- https://docs.runpod.io/serverless/endpoints/overview
- https://docs.runpod.io/serverless/endpoints/endpoint-configurations
- https://docs.runpod.io/serverless/endpoints/send-requests
- https://docs.runpod.io/serverless/pricing

Verbatim evidence:

> "Serverless offers pay-per-second pricing with no upfront costs. You're billed from when a worker starts until it fully stops, rounded up to the nearest second."

> Queue-based endpoints provide async `/run`, sync `/runsync`, status, cancel, retry, and health operations.

> Default max workers: 3; max workers are the "Maximum concurrent instances your endpoint can scale to."

Relevant current serverless compute rates:

> RTX 4090 Pro $0.00031/sec; A6000/A40 $0.00034/sec; L40/L40S $0.00053/sec; A100 $0.00076/sec; H100 Pro $0.00116/sec.

At 20 seconds of warm execution, compute alone is about $0.0062 on 4090, $0.0106 on L40S, or $0.0152 on A100. Startup and idle seconds are also billed, plus storage.

> "Active workers incur charges continuously, including when idle."

Assessment: best escape hatch for a custom OpenPose/ControlNet plus identity pipeline and predictable six-worker concurrency. It adds container ownership, cold starts, capacity tuning, monitoring, and license obligations.

