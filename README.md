# X Reply Judge (Clef / Jev)

Chrome MV3 extension that adds one small badge to each post or reply on X (Twitter): `AI 87%`,
an experimental estimate that the text was AI-written, as judged by **Cloudflare Clef / Clef Flash** or **TypeSafe Jev**.
Colors: **>= 70 red**, **>= 31 orange**, otherwise gray. No reasons, no signal lists.

Also adds **Mute** / **Block** buttons on each reply (post detail / notifications). They act **only when you click them**.

## Based on x-reply-guard (MIT)

This project is a modified derivative of
[dontbesilent2025/x-reply-guard](https://github.com/dontbesilent2025/x-reply-guard)
(commit `56bda1b`), Copyright (c) 2026 dontbesilent, MIT License. The DOM scraping
(`data-testid` selectors), cache/auto-scan flow and the hide/block logic in `reply-cleaner.js`
come from that project. See `LICENSE`.

Changes: scoring uses one typed decision-model call per item via Cloudflare Clef or TypeSafe Jev; only the text is sent; the output is a single probability; everything is in English;
scanning covers the home feed and post detail pages (auto or manual).

## How it works

### Pages

| Page | What is scored |
| ---- | -------------- |
| Home feed (`/`, `/home`) and other post streams (explore, search, bookmarks, lists, profiles) | Visible posts (skips your own) |
| Post detail (`/user/status/id`) | Replies under the main post (other accounts) |

### Trigger modes (Options → Scanning)

- **Auto** (default): when you open a feed or a post detail page, newly visible unscored items
  are batched (~2 s) and sent to the API, capped by the daily auto-scan limit.
- **Manual**: no automatic API calls. Already-cached scores still show. Click **Scan posts** /
  **Scan replies** (floating button) or the toolbar icon to analyze.

Manual scan always works in both modes.

### Pipeline

- Comments of 10 or fewer non-whitespace Unicode characters receive a fixed **20%** locally. This is a display rule, not a model prediction; it overrides old cached scores and consumes no API request or auto-scan quota.
- `state` sent to the API = **the text only**. No author, tweet id, timestamps or the original post.
  The tweet id is used only locally as the cache key.
- One request per item, at most N in flight (default 4), at most M items per scan (default 30).
- Results are cached in `chrome.storage.local` per tweet id and judgment configuration for 7 days. A changed model/provider/prompt cannot reuse old scores; in-flight old results are discarded.
- On pages where auto is off or paused, already-cached scores are shown without calling the API.

## Cloudflare Clef setup (0.3.0)

1. Reload the unpacked extension in Chrome's extension manager, then open Options.
2. Under **判断模型 / Model**, select **Cloudflare Workers AI — Clef**.
3. Choose **Clef** (`@cf/cloudflare/clef`) or **Clef Flash** (`@cf/cloudflare/clef-flash`).
4. Enter your Cloudflare Account ID and a dedicated account-scoped API Token with **Workers AI:Read** permission.
5. Click **Save**, grant the requested `api.cloudflare.com` host access, and click **Test connection**. Reload X before scanning.

New installs default to Clef. Existing Jev installations keep their selected provider until explicitly switched. The Jev key and Cloudflare token are stored separately in `chrome.storage.local`; switching providers preserves both. Jev's model field is also available directly in the Model section. The detection prompt and short-comment rule are shared across providers.

The Cloudflare adapter uses the official REST endpoint `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/clef` (or `clef-flash`), with body `{ model: "clef", state, questions }` and response envelope `result.answers.<question_key>.noul`. The model is selected in both URL and body. Only the reply text goes into `state`.

[Cloudflare's official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) lists a shared Workers AI allocation of **10,000 Neurons/day**, reset at **00:00 UTC**. This is not 10,000 requests. Paid accounts can incur charges after the allocation; the extension's item counter does not measure Neurons or enforce free-only billing.

Live smoke test on 2026-10-21: both models responded successfully through this adapter using a dedicated token. On one illustrative Chinese reply, Clef returned 88% and Clef Flash 46%; this verifies integration, not detection accuracy. Results: [test/clef-live-result.json](test/clef-live-result.json). To repeat the two-request test, put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_CLEF_API_TOKEN` in the ignored local `.env`, then run `node test/clef-live.js`. No credential is printed or committed.

In initial manual testing with the same prompt, Clef's scores appeared less accurate than Jev's. The prompt had previously been tuned on Jev, so this is not a controlled comparison or evidence of a general model ranking. This release adds a provider option; it does not claim improved detection accuracy.

## Jev API: what is verified vs. assumed

Note: the request mentioned "TypeSage"; the docs found are for **TypeSafe** (typesafe.ai), whose model is Jev.

Verified from the official docs (opened 2026-10-20):

- https://docs.typesafe.ai/api/system-one.md (OpenAPI): `POST https://api.typesafe.ai/v1/systemone`,
  `Authorization: Bearer <API_KEY>`, body `{ model, state, questions: { <name>: { type: "noul", instructions } } }`,
  response `{ model, answers: { <name>: { type: "noul", noul: 0.98 } }, usage }`.
- https://docs.typesafe.ai/primitives/noul.md: `noul` is the probability (0-1) that the answer is yes.
- https://docs.typesafe.ai/models.md: model `jev-latest` (alias of `jev-1.13.0`; `jev-preview` → `jev-1.14.0`),
  price $0.042 per million input tokens (output free), 64k/32k context, rate limits per organization
  (tokens/s and requests/s, shown in the developer console), 429 on overflow with optional `retry-after`.
  English is the strongest language; CJK is weaker.
- https://docs.typesafe.ai/api/errors.md: status codes 400/401/413/415/422/429/529; retry 429/529 with backoff.

Assumed / not verified:

- **There is no dedicated "AI-text detection" endpoint** in the TypeSafe docs. Jev is a general decision
  model; this extension asks a `noul` question
  about whether the wording was predominantly AI-generated, with guidance to compare human and AI explanations.
  Its accuracy as an AI-text detector is **not documented or benchmarked by TypeSafe**.
- The question wording, the `ai_generated` question key and the treatment of `noul` as "AI probability" are this project's choices.
- API unit tests use mocked responses shaped like the documented example. On 2026-10-20, a live prompt comparison used the existing browser configuration: the selected prompt scored 35/48 versus 33/48 for the original on a small held-out set, with fewer human false positives and the same AI false negatives. This is not a benchmark of real X accuracy. See [the evaluation report](test/prompt-eval-2026-10-20/report.md).
- Third-party sites (e.g. jev-ai-detector.com, jevtypesafeai.com) advertise other "Jev detector" endpoints; they are not official and are not used.

Select the provider and model in **Options → 判断模型 / Model**. Jev connection and response settings are editable in **Options → Advanced** (base URL, path, auth header name and scheme,
question key, response field path). Instructions are editable in **Detection prompt**. Cloudflare and custom hosts ask for an optional host permission on Save or Test connection.

The current local default is an experimental Chinese prompt of roughly 400 characters, informed by Google research into sycophancy, repetition, formulaic structure, hollow rhetorical contrasts, and low information gain. These are contextual clues, not keyword rules. This version has not been live-evaluated, and improved accuracy has not been demonstrated. See [the research notes](test/prompt-eval-2026-10-20/google-research.md). All earlier accuracy results apply only to their recorded prompt versions.

The **Detection prompt** section is directly editable, supports Chinese and English, and has a separate **Restore default prompt** button. Click **Save** to apply edits; a changed prompt clears old scores automatically. Reload X before rescanning to refresh badges already on the page. Changing the provider, model, or endpoint settings also clears the cache automatically. Updates migrate only exact known defaults (the original, `contrast`, long slop, and concise principle prompts) and preserve custom instructions. Reload the unpacked extension to load code changes.

## Install

1. Unzip `x-reply-judge-jev.zip` (or use this folder).
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the folder.
3. Open the extension's **Options**, choose Cloudflare or TypeSafe, and enter that provider's credentials. For Cloudflare, follow the setup section above; for Jev, select TypeSafe and paste a key from https://console.typesafe.ai. Click **Save**, then **Test connection**.
4. Open `x.com/home` or any post: in Auto mode scoring starts on its own; or click **Scan posts** /
   **Scan replies**.

Credentials are stored only in `chrome.storage.local`, never synced. Cloudflare credentials go only to `api.cloudflare.com`; the Jev key goes to its configured API host.

## Development

```
npm run check   # node --check on every script + manifest JSON parse
npm test        # API parsing/retry/concurrency + page-detect unit tests with mocked fetch
```

No dependencies.

## Limitations

- X's DOM changes often; the `data-testid` selectors and localized menu labels may break.
- Very short texts give the model little to judge; treat scores as a hint, not proof.
- Jev is calibrated for its documented decision tasks, not specifically for AI-text detection.
- Requests run from the browser with your selected provider key/token; anyone with access to your Chrome profile can read it.
- Auto mode on a busy feed can consume the daily limit quickly; lower the limit or switch to Manual if needed.
