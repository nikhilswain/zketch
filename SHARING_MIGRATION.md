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
