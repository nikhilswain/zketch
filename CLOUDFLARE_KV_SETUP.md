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
