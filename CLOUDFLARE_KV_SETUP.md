# Cloudflare KV Setup for ZKetch Sharing

This document explains how to set up Cloudflare KV for the new sharing system.

## Prerequisites

1. Wrangler CLI installed: `npm install -g wrangler`
2. Logged in to Cloudflare: `wrangler auth login`

## Setup Steps

### 1. Create KV Namespace

For development:

```bash
wrangler kv:namespace create "ZKETCH_SHARES"
```

For production:

```bash
wrangler kv:namespace create "ZKETCH_SHARES" --env production
```

### 2. Update wrangler.toml

Copy the namespace IDs from the command output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ZKETCH_SHARES"
id = "your-production-id-here"
preview_id = "your-preview-id-here"
```

### 3. Deploy

Deploy to Cloudflare Pages with the KV binding:

```bash
npm run build
wrangler pages deploy dist --project-name zketch
```

## How It Works

### Storage

- Drawings are stored as JSON in Cloudflare KV
- Each share gets a unique 12-character ID
- Data automatically expires after 30 days
- Maximum size: 20MB (conservative limit for 25MB KV limit)

### API Endpoints

- `POST /api/share/store` - Store a new shared drawing
- `GET /api/share/[shareId]` - Retrieve a shared drawing

### URL Format

New format: `https://zketch.pages.dev/share/{shareId}`
Old format: `https://zketch.pages.dev/share?data={base64data}` (deprecated)

## Size Optimization

The new system uses:

- JPG compression (quality: 0.8)
- Reasonable resolution (800x600)
- Size validation before storage
- Graceful error handling for large drawings

## Benefits

1. **Clean URLs**: No more massive query parameters
2. **Reliable**: No browser URL length limits
3. **Secure**: Data stored in Cloudflare's edge network
4. **Temporary**: Automatic expiration prevents storage bloat
5. **Fast**: Global CDN distribution

## Error Handling

- Size limit exceeded: Shows friendly error message
- KV not available: Graceful fallback with error message
- Share not found: Clear explanation with retry option
- Network issues: Automatic retry suggestions

## Backblaze B2 bucket for playable shares

New shares store their files in a private Backblaze B2 bucket (10 GB free, no
card needed) and still use the KV namespace above for the rate limit. Visitors
never talk to B2: the server reaches it through B2's S3-compatible API with a
secret key, and everything goes through the `/api/shares/*` routes. Do this
once:

1. Create a free Backblaze account at backblaze.com (B2 Cloud Storage, no card).
2. Buckets -> Create a Bucket. Name it e.g. `zketch-shares`, set Files in
   Bucket to **Private**, leave the rest as is.
3. Note the bucket's **S3 Endpoint** shown on the bucket card, e.g.
   `s3.us-west-004.backblazeb2.com`.
4. Application Keys -> Add a New Application Key. Allow access to that bucket
   only, type of access **Read and Write**. Copy the `keyID` and the
   `applicationKey` (the application key is shown only once).
5. Cloudflare dashboard -> Workers & Pages -> zketch -> Settings -> Variables
   and Secrets. Add, for Production (and Preview if you use it):
   - `ZKETCH_B2_ENDPOINT` (plain text): the S3 endpoint from step 3
   - `ZKETCH_B2_BUCKET` (plain text): the bucket name from step 2
   - `ZKETCH_B2_KEY_ID` (Secret): the `keyID` from step 4
   - `ZKETCH_B2_APP_KEY` (Secret): the `applicationKey` from step 4
6. Redeploy so the variables take effect.

When all four variables are set the server uses B2. Otherwise it falls back to
an R2 binding named `ZKETCH_SHARE_FILES`, which is what local development uses
(wrangler emulates R2 on disk, no Cloudflare account needed). `wrangler.toml` is
gitignored and only used for local development; for local dev add to your own
`wrangler.toml`:

```toml
[[r2_buckets]]
binding = "ZKETCH_SHARE_FILES"
bucket_name = "zketch-shares"
```

With neither B2 nor the binding, `POST /api/shares` returns 500 "Storage not
available". Objects are `shares/<id>/drawing.zketch` (gzipped), `picture.png`
and `preview.jpg`; nothing expires, so owners remove a share with "Unshare" in
the export dialog.

**Edge cache.** B2's free tier caps download and info calls at about 2,500 a
day, so the server keeps share files and the page's share details in the
Cloudflare edge cache for a day (a missing share or file for a minute). The
cache is per Cloudflare location, so each location fetches from B2 once. Repeat
views and link-preview bots are served from the cache instead of B2. Unsharing
deletes the objects from B2 and clears the cache in the Cloudflare location
that handled the request; other locations may keep serving a cached copy for
up to a day (the `max-age` is 1 day), after which the link stops working
everywhere.

Recommended: add one free Cloudflare rate-limiting rule for `/api/shares/*`
and `/share/*` (for example 60 requests per 10 seconds per IP, action block).
Requests for random ids that do not exist still reach B2 once per location per
minute, and the rule keeps a scanner from using up the daily allowance.
