# ZKetch Sharing System Migration Guide

## What Changed?

We've upgraded the sharing system from URL-based sharing to a cloud-based solution using Cloudflare KV storage.

### Before (Old System)

- Share links contained the entire drawing data in the URL
- Links could be extremely long (15KB+)
- Browser compatibility issues with very large drawings
- URL: `https://zketch.pages.dev/share?data=base64encodeddata...`

### After (New System)

- Share links use short, clean IDs
- Drawing data stored securely in the cloud
- 30-day automatic expiration
- URL: `https://zketch.pages.dev/share/abc123xyz456`

## Benefits

1. **Clean URLs**: Short, shareable links that work everywhere
2. **Reliability**: No browser URL length limits
3. **Better Performance**: Faster loading and sharing
4. **Security**: Data stored on Cloudflare's global network
5. **Smart Limits**: 20MB limit with clear error messages

## For Existing Links

- Old share links will continue to work
- They show a notice encouraging users to re-share for better links
- No action required from users with existing links

## For Developers

### New API Endpoints

```typescript
// Store a drawing
POST /api/share/store
{
  "name": "My Drawing",
  "data": "data:image/jpeg;base64,/9j/4AAQ...",
  "timestamp": 1640995200000
}

// Retrieve a drawing
GET /api/share/{shareId}
```

### Size Handling

- Automatic size validation before storage
- Graceful error messages for oversized drawings
- Suggestion to export as file for very large drawings

### Error States

- Clear error messages for all failure scenarios
- Retry buttons where appropriate
- Fallback suggestions (export as file)

## Migration Timeline

- ✅ New system deployed alongside old system
- ✅ All new shares use the KV system automatically
- ✅ Old links continue working with deprecation notice
- 🔄 Monitor usage and performance
- 📅 Future: Gradual sunset of URL-based system (12+ months)

## Playable sharing (Backblaze B2)

Newer shares are playable: the page replays how the drawing was made, and the
viewer can download a picture or a video, or (if the owner allowed it) continue
the drawing in their own vault.

- New shares go to `POST /api/shares` and are stored in a private Backblaze B2
  bucket (reached by the server through the S3 API, variables
  `ZKETCH_B2_ENDPOINT`, `ZKETCH_B2_BUCKET`, `ZKETCH_B2_KEY_ID`,
  `ZKETCH_B2_APP_KEY`), with no expiry. Local development uses the R2 emulation
  binding `ZKETCH_SHARE_FILES` instead. The KV namespace `ZKETCH_SHARES` is
  still needed for the rate limit (20 shares per IP per hour).
- Files and share details are kept in the Cloudflare edge cache for a day, so
  after an unshare a link can keep working in other locations for up to a day.
- The `/api/share/*` routes and KV shares above keep working untouched. A
  `/share/<id>` that is not in the bucket falls back to the old viewer.
- The owner can unshare from the export dialog; the delete key is kept in that
  browser's localStorage (`zketch-shares-v1`).
- Setup steps are in `CLOUDFLARE_KV_SETUP.md`; how it works is in
  `architecture.md` section 10.2.
