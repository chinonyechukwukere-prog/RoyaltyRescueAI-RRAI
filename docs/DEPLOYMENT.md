# RRAI — IBM Cloud Code Engine Deployment Guide
**OA-1 — Architecture v1.7 §11**

## Overview

The RRAI prototype is deployed as a containerised Next.js application on IBM Cloud Code Engine. The build uses Next.js `output: 'standalone'` to produce a minimal self-contained server. All secrets are injected at runtime via Code Engine environment variables and secrets — nothing sensitive is baked into the image.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| IBM Cloud CLI | latest | `winget install IBM.IBMCloudCLI` |
| Code Engine plugin | latest | `ibmcloud plugin install code-engine` |
| Container Registry plugin | latest | `ibmcloud plugin install container-registry` |
| Docker Desktop | 4.x+ | https://www.docker.com/products/docker-desktop |

Log in:
```powershell
ibmcloud login --sso
ibmcloud cr login
ibmcloud ce project select --name rrai-prototype
```

---

## Environment Variables

### Build-time (non-secret — safe for `--build-arg`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project REST endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (enforced by RLS) |
| `DEFAULT_CITIZEN_ORG_ID` | UUID of Org A (RapidResponse NG) |
| `WEBHOOK_ORG_B_ID` | UUID of Org B (Lagos 112) |

### Runtime secrets (inject via Code Engine secret — NEVER in image)
| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server-side DB writes |
| `WATSONX_API_KEY` | IBM Cloud IAM API key for watsonx.ai (OA-2) |
| `WATSONX_PROJECT_ID` | watsonx.ai project ID (OA-2) |
| `WATSONX_URL` | watsonx.ai regional endpoint (OA-2) |
| `WEBHOOK_112_SECRET` | Shared secret for POST /api/webhooks/112 |
| `OUTDATED_THRESHOLD_HOURS` | Hospital profile staleness threshold (default: 4) |

---

## Step-by-step Deployment

### 1. Build and push the container image

```powershell
# Set your IBM Cloud container registry namespace
$NAMESPACE = "rrai-prototype"
$REGION    = "us.icr.io"
$IMAGE     = "$REGION/$NAMESPACE/rrai-app:latest"

# Build (pass non-secret build args)
docker build `
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://sdmivyxnzducsahgdeno.supabase.co/rest/v1/" `
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon_key_from_env_local>" `
  -t $IMAGE .

# Push
docker push $IMAGE
```

### 2. Create the Code Engine secret (runtime secrets only)

```powershell
ibmcloud ce secret create --name rrai-runtime-secrets `
  --from-literal SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" `
  --from-literal WATSONX_API_KEY="<ibm_iam_api_key>" `
  --from-literal WATSONX_PROJECT_ID="<watsonx_project_id>" `
  --from-literal WATSONX_URL="https://us-south.ml.cloud.ibm.com" `
  --from-literal WEBHOOK_112_SECRET="<webhook_secret>" `
  --from-literal OUTDATED_THRESHOLD_HOURS="4"
```

> ⚠️ Do not echo or log these values. Set them interactively or pipe from a secure vault.

### 3. Deploy the application

```powershell
ibmcloud ce application create `
  --name rrai-app `
  --image $IMAGE `
  --registry-secret rrai-registry-secret `
  --env-from-secret rrai-runtime-secrets `
  --env NEXT_PUBLIC_SUPABASE_URL="https://sdmivyxnzducsahgdeno.supabase.co/rest/v1/" `
  --env NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon_key>" `
  --env DEFAULT_CITIZEN_ORG_ID="aaaaaaaa-0001-0001-0001-000000000001" `
  --env WEBHOOK_ORG_B_ID="bbbbbbbb-0002-0002-0002-000000000002" `
  --port 3000 `
  --min-scale 1 `
  --max-scale 3 `
  --cpu 0.5 `
  --memory 1G
```

### 4. Get the application URL

```powershell
ibmcloud ce application get --name rrai-app --output url
```

### 5. Update (redeploy after a new image push)

```powershell
ibmcloud ce application update --name rrai-app --image $IMAGE
```

---

## Verification

After deployment, run a smoke check against the live URL:

```powershell
$BASE = "https://<your-code-engine-url>"

# Citizen intake (public route)
Invoke-RestMethod -Method POST "$BASE/api/incidents" `
  -ContentType "application/json" `
  -Body '{"caller_name":"Smoke Test","caller_phone":"+2340000000000","location_description":"Test","lga":"Lagos Island","emergency_type":"cardiac","presenting_complaint":"Test","persons_affected":1,"preferred_language":"en","consent_given":true}'

# Auth (expect 401 without token)
Invoke-RestMethod -Method GET "$BASE/api/incidents" -ErrorAction SilentlyContinue
```

---

## Outstanding Action OA-2 (watsonx.ai)

The copilot route (`POST /api/copilot/query`) returns validated hospital candidates with stub rationale until OA-2 is resolved. Once the Technical Lead confirms the model ID and endpoint:

1. Add `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL` to `rrai-runtime-secrets`
2. Update `app/api/copilot/query/route.ts` to call watsonx.ai with the confirmed model ID
3. Redeploy: `ibmcloud ce application update --name rrai-app --image <new_image>`

---

## Safety constraints (do not modify)
- `SUPABASE_SERVICE_ROLE_KEY` must never appear in any client bundle, API response, or log
- Minimum scale ≥ 1 (always-on for competition demo)
- No autonomous clinical or dispatch decisions — all consequential actions require human agent approval
- Synthetic data only during the prototype phase
