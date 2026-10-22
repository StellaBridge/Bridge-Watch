# API Versioning Strategy

## Overview

This document defines the versioning strategy for the Bridge Watch API, including guidelines for introducing new versions, deprecating old endpoints, and managing breaking changes.

## Current Strategy

### URL Prefix Versioning

Bridge Watch uses URL prefix versioning for the REST API:

```
https://api.bridge-watch.example.com/api/v1/assets
https://api.bridge-watch.example.com/api/v1/bridges
https://api.bridge-watch.example.com/api/v1/transactions
```

The version is embedded in the URL path immediately after `/api/`. This approach provides:
- Clear visibility of API version in use
- Easy routing at the reverse proxy or API gateway level
- Simple client-side version management

### Current Version

**Version: v1**

The current production API is v1. All endpoints are prefixed with `/api/v1/`.

## Introducing New Versions

### When to Introduce a New Version

A new major version should be introduced when:
- Breaking changes are required that cannot be avoided
- Fundamental changes to authentication or authorization
- Major restructuring of resource representations
- Removal of previously deprecated endpoints

### Non-Breaking Changes

The following changes do not require a new version:
- Adding new endpoints
- Adding optional request parameters
- Adding new fields to responses (clients should ignore unknown fields)
- Fixing bugs that restore documented behavior
- Performance improvements
- Adding new enum values (if clients handle unknown values gracefully)

### Version Introduction Process

1. **Planning Phase**
   - Document all breaking changes
   - Identify affected endpoints
   - Estimate migration effort for clients
   - Create migration guide

2. **Implementation Phase**
   - Implement new version endpoints under `/api/v2/`
   - Keep v1 endpoints operational
   - Add version negotiation logic
   - Update API documentation

3. **Testing Phase**
   - Run full regression suite against both versions
   - Perform load testing
   - Validate backward compatibility where preserved

4. **Release Phase**
   - Announce new version with migration guide
   - Provide side-by-side documentation
   - Start deprecation timeline for v1

## Deprecation Policy

### Timeline

**Minimum Deprecation Period: 6 months**

Once a new version is released, the previous version will be maintained for a minimum of 6 months before removal. The deprecation timeline follows these phases:

| Phase | Duration | Status |
|-------|----------|--------|
| **Active** | Ongoing | Current production version, fully supported |
| **Deprecated** | 6-12 months | Previous version, maintenance mode only |
| **Sunset** | 1 month | Final warning period before removal |
| **Removed** | After sunset | Version no longer available |

### Deprecation Process

1. **Announcement** (Month 0)
   - Publish deprecation notice in release notes
   - Update API documentation with deprecation warnings
   - Add `Deprecation` and `Sunset` HTTP headers to affected endpoints
   - Send email notifications to registered API consumers

2. **Deprecation Headers**
   ```http
   Deprecation: true
   Sunset: Sat, 31 Dec 2027 23:59:59 GMT
   Link: <https://docs.bridge-watch.example.com/migration/v1-to-v2>; rel="deprecation"
   ```

3. **Warning Period** (Months 1-6)
   - Continue full support for deprecated version
   - Provide migration assistance
   - Monitor usage metrics
   - Send periodic reminders to active consumers

4. **Sunset Period** (Month 6-7)
   - Increase warning frequency
   - Add prominent notices in API responses
   - Final migration push for remaining consumers

5. **Removal** (After Month 7)
   - Remove deprecated version endpoints
   - Return 410 Gone for requests to old endpoints
   - Provide error message with migration guide link

### Monitoring Deprecation

The API Deprecation Dashboard (available in Grafana) tracks:
- Request volume by API version
- Active client applications by version
- Deprecation header delivery rate
- Time to sunset for each deprecated version

Dashboard URL: `/grafana/d/api-deprecation`

## Backward Compatibility Guarantees

### Within a Major Version

Within a major version (e.g., all v1.x releases), Bridge Watch guarantees:

1. **Additive Changes Only**
   - New endpoints can be added
   - New optional parameters can be added
   - New response fields can be added

2. **No Breaking Changes**
   - Existing endpoints will not change behavior
   - Required parameters will not be removed
   - Response field types will not change
   - Error codes will not change meaning

3. **Bug Fixes Exception**
   - Bug fixes that restore documented behavior may be applied even if they change observed behavior

### Client Responsibilities

Clients consuming the API should:
- Ignore unknown fields in responses
- Handle new enum values gracefully
- Not rely on undocumented behavior
- Specify API version explicitly in requests
- Monitor `Deprecation` and `Sunset` headers

## WebSocket Protocol Versioning

WebSocket connections are versioned separately from the REST API due to their stateful nature.

### Connection Version Negotiation

Clients specify the desired protocol version during the WebSocket handshake:

```javascript
const ws = new WebSocket('wss://api.bridge-watch.example.com/ws?version=1');
```

### Version Compatibility

- WebSocket protocol versions are independent of REST API versions
- A client can use WebSocket v1 with REST API v2
- Protocol version determines message format and available channels

### Deprecation

WebSocket protocol versions follow the same deprecation timeline as REST API versions:
- 6-month minimum deprecation period
- Server sends deprecation warnings in control messages
- Clients should monitor for `deprecated` message type

Example deprecation message:
```json
{
  "type": "control",
  "subtype": "deprecated",
  "message": "WebSocket protocol v1 is deprecated and will be removed on 2027-12-31",
  "sunset": "2027-12-31T23:59:59Z",
  "migration_guide": "https://docs.bridge-watch.example.com/ws/v1-to-v2"
}
```

For detailed WebSocket protocol specification, see [websocket-protocol.md](./websocket-protocol.md).

## Breaking Change Examples

### Breaking Changes (Require New Version)

- Removing an endpoint
- Removing a request parameter
- Removing a response field
- Changing a field type (e.g., string to number)
- Changing authentication method
- Changing error code meanings
- Renaming fields
- Making optional parameter required
- Changing URL structure

### Non-Breaking Changes (Same Version)

- Adding new endpoint
- Adding optional request parameter
- Adding response field
- Adding new HTTP header
- Deprecating endpoint (with 6-month notice)
- Performance improvement
- Bug fix
- Adding new enum value
- Adding new error code
- Improving error messages

## Version in HTTP Headers

Clients can optionally specify version preference via header:

```http
Accept: application/vnd.bridge-watch.v1+json
```

However, URL-based versioning takes precedence. Header-based version negotiation is supported for advanced use cases but not required.

## API Version Lifecycle

```
  Release          Active Support          Deprecation          Sunset      EOL
     |                    |                     |                  |          |
     v                    v                     v                  v          v
   v1.0.0  ──────────────────────────────────────────────────────────────  (removed)
                                               v2.0.0  ──────────────────────────────
                                                                           (active)
```

## Client Migration Support

### Migration Guides

Each new version release includes:
- Comprehensive migration guide
- Side-by-side comparison of endpoints
- Code examples for common use cases
- Breaking changes summary
- Timeline and support schedule

### Tools

Bridge Watch provides:
- API compatibility checker tool
- Request/response diff tool
- Mock endpoints for testing migrations
- Sandbox environment with both versions

### Support Channels

- Documentation: https://docs.bridge-watch.example.com
- Migration Guide: https://docs.bridge-watch.example.com/migration
- GitHub Discussions: https://github.com/StellaBridge/Bridge-Watch/discussions
- Email Support: api-support@bridge-watch.example.com

## Version Metadata Endpoint

Current API version information is available at:

```
GET /api/version
```

Response:
```json
{
  "current_version": "v1",
  "supported_versions": ["v1"],
  "deprecated_versions": [],
  "latest_version": "v1",
  "version_details": {
    "v1": {
      "status": "active",
      "released": "2024-01-15",
      "deprecated": null,
      "sunset": null
    }
  }
}
```

## Semantic Versioning

While the public API uses major version prefixes (v1, v2), internal versioning follows semantic versioning:

- **Major** (v1 → v2): Breaking changes
- **Minor** (v1.1 → v1.2): New features, backward compatible
- **Patch** (v1.1.0 → v1.1.1): Bug fixes, backward compatible

The URL prefix reflects only the major version.

## Change Log

All API changes are documented in the [CHANGELOG.md](../CHANGELOG.md) with version numbers and release dates.

## Questions and Feedback

For questions about API versioning or to provide feedback, please:
- Open a GitHub issue
- Join the discussion in GitHub Discussions
- Contact the API team at api-support@bridge-watch.example.com
