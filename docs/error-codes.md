# Error Code Reference

## Overview

This document provides a comprehensive reference for all error codes returned by the Bridge Watch API. Each error includes the code, HTTP status, description, common causes, and resolution steps.

Error codes follow the pattern: `CATEGORY_SPECIFIC_ERROR`

## Error Categories

- [Authentication](#authentication-errors)
- [Authorization](#authorization-errors)
- [Validation](#validation-errors)
- [Bridge](#bridge-errors)
- [Contract](#contract-errors)
- [Rate Limiting](#rate-limiting-errors)
- [System](#system-errors)
- [Network](#network-errors)

## Error Response Format

All errors follow this JSON structure:

```json
{
  "error": "Error Title",
  "message": "Detailed error message with context",
  "errorCode": "ERROR_CODE",
  "httpStatus": 400,
  "severity": "error",
  "category": "validation",
  "retryGuidance": "Wait 60 seconds before retrying",
  "documentationUrl": "https://docs.bridge-watch.example.com/errors/ERROR_CODE"
}
```

## Authentication Errors

### AUTH_REQUIRED
**HTTP Status:** 401  
**Severity:** error

**Description:**  
Authentication is required to access this endpoint.

**Common Causes:**
- Missing Authorization header
- Request made without authentication token
- Accessing protected endpoint anonymously

**Resolution:**
1. Obtain an API token or JWT
2. Include in Authorization header: `Authorization: Bearer <token>`
3. Retry the request

---

### AUTH_INVALID_TOKEN
**HTTP Status:** 401  
**Severity:** error

**Description:**  
The authentication token provided is invalid or malformed.

**Common Causes:**
- Token format is incorrect
- Token has been tampered with
- Wrong token type (e.g., using refresh token as access token)

**Resolution:**
1. Verify token format
2. Ensure token is properly base64 encoded
3. Check for extra spaces or line breaks
4. Obtain a new token if issue persists

---

### AUTH_TOKEN_EXPIRED
**HTTP Status:** 401  
**Severity:** error

**Description:**  
The authentication token has expired.

**Common Causes:**
- Token age exceeds maximum lifetime (default: 1 hour)
- System time drift between client and server
- Long-running process using cached token

**Resolution:**
1. Use refresh token to obtain new access token
2. Re-authenticate if refresh token also expired
3. Implement automatic token refresh in your application

**Retry Guidance:** Retry immediately after refreshing token

---

### AUTH_INVALID_CREDENTIALS
**HTTP Status:** 401  
**Severity:** error

**Description:**  
The username or password provided is incorrect.

**Common Causes:**
- Typo in username or password
- Account credentials changed
- Using old credentials after password reset

**Resolution:**
1. Double-check username and password
2. Use password reset if forgotten
3. Check for caps lock or extra spaces
4. Contact support if lockout occurs

**Retry Guidance:** Do not retry automatically. Requires user input.

---

### AUTH_ACCOUNT_LOCKED
**HTTP Status:** 403  
**Severity:** warning

**Description:**  
Account is temporarily locked due to security policy.

**Common Causes:**
- Multiple failed login attempts (default: 5 attempts)
- Suspicious activity detected
- Administrative lock

**Resolution:**
1. Wait for automatic unlock (default: 30 minutes)
2. Use password reset link to unlock immediately
3. Contact support if locked administratively

**Retry Guidance:** Wait 30 minutes before retrying

---

### AUTH_SESSION_EXPIRED
**HTTP Status:** 401  
**Severity:** info

**Description:**  
User session has expired due to inactivity.

**Common Causes:**
- No activity for maximum session duration (default: 24 hours)
- Server restart invalidated sessions
- User logged out from another device

**Resolution:**
1. Re-authenticate to establish new session
2. Session cookies/tokens are no longer valid

---

## Authorization Errors

### AUTHZ_INSUFFICIENT_PERMISSIONS
**HTTP Status:** 403  
**Severity:** error

**Description:**  
User does not have sufficient permissions to perform this action.

**Common Causes:**
- User role lacks required permission
- Resource belongs to different organization
- Feature requires higher subscription tier

**Resolution:**
1. Check user role and permissions
2. Request permission upgrade from administrator
3. Verify resource ownership
4. Upgrade subscription if needed

---

### AUTHZ_RESOURCE_ACCESS_DENIED
**HTTP Status:** 403  
**Severity:** error

**Description:**  
Access to the requested resource is denied.

**Common Causes:**
- Resource is private
- User not added to resource ACL
- Resource was deleted or archived

**Resolution:**
1. Request access from resource owner
2. Verify resource ID is correct
3. Check if resource still exists

---

## Validation Errors

### VALIDATION_REQUIRED_FIELD_MISSING
**HTTP Status:** 400  
**Severity:** error

**Description:**  
One or more required fields are missing from the request.

**Common Causes:**
- Request body incomplete
- Required query parameter omitted
- Null value provided for required field

**Resolution:**
1. Check API documentation for required fields
2. Ensure all required fields are included
3. Verify Content-Type header is set correctly

---

### VALIDATION_INVALID_FORMAT
**HTTP Status:** 400  
**Severity:** error

**Description:**  
Field value does not match the expected format.

**Common Causes:**
- Invalid email format
- Malformed date/time string
- Invalid UUID format
- Number provided as string

**Resolution:**
1. Check field format requirements in documentation
2. Use correct data types
3. Validate input before sending request

**Examples:**
- Email: `user@example.com`
- Date: `2024-12-15T10:30:45Z` (ISO 8601)
- UUID: `550e8400-e29b-41d4-a716-446655440000`

---

### VALIDATION_OUT_OF_RANGE
**HTTP Status:** 400  
**Severity:** error

**Description:**  
Field value is outside the acceptable range.

**Common Causes:**
- Number too large or too small
- String too long or too short
- Date in the past when future date required

**Resolution:**
1. Check min/max constraints in documentation
2. Adjust value to be within valid range

**Common Ranges:**
- Amount: 0.01 to 1,000,000,000
- Page size: 1 to 100
- Asset code: 1 to 12 characters

---

### VALIDATION_INVALID_ENUM_VALUE
**HTTP Status:** 400  
**Severity:** error

**Description:**  
Field value is not one of the allowed enum values.

**Common Causes:**
- Typo in enum value
- Using deprecated enum value
- Case sensitivity mismatch

**Resolution:**
1. Check allowed values in API documentation
2. Enum values are case-sensitive
3. Use exact spelling

---

### VALIDATION_DUPLICATE_ENTRY
**HTTP Status:** 409  
**Severity:** error

**Description:**  
The resource already exists with the provided unique identifier.

**Common Causes:**
- Duplicate email address
- Duplicate asset code
- Re-submitting same transaction

**Resolution:**
1. Use different unique identifier
2. Update existing resource instead of creating new one
3. Check if resource already exists before creating

---

## Bridge Errors

### BRIDGE_NOT_FOUND
**HTTP Status:** 404  
**Severity:** error

**Description:**  
The specified bridge does not exist.

**Common Causes:**
- Invalid bridge ID
- Bridge was removed
- Typo in bridge identifier

**Resolution:**
1. Verify bridge ID is correct
2. List available bridges via GET /api/v1/bridges
3. Check if bridge is still active

---

### BRIDGE_UNAVAILABLE
**HTTP Status:** 503  
**Severity:** critical

**Description:**  
The bridge is temporarily unavailable.

**Common Causes:**
- Bridge maintenance
- Network connectivity issues
- Bridge contract paused
- High load on bridge

**Resolution:**
1. Check bridge status dashboard
2. Wait for bridge to become available
3. Use alternative bridge if urgent
4. Monitor system status page

**Retry Guidance:** Retry with exponential backoff starting at 60 seconds

---

### BRIDGE_INSUFFICIENT_LIQUIDITY
**HTTP Status:** 400  
**Severity:** warning

**Description:**  
Bridge does not have sufficient liquidity for the requested transaction.

**Common Causes:**
- Transaction amount exceeds available liquidity
- Multiple large transactions depleting pool
- Bridge reserves low

**Resolution:**
1. Reduce transaction amount
2. Split into multiple smaller transactions
3. Wait for liquidity to be replenished
4. Use alternative bridge with better liquidity

---

### BRIDGE_TRANSACTION_FAILED
**HTTP Status:** 500  
**Severity:** error

**Description:**  
Bridge transaction failed during processing.

**Common Causes:**
- Blockchain transaction reverted
- Gas estimation failure
- Contract execution error
- Network timeout

**Resolution:**
1. Check transaction details in blockchain explorer
2. Verify sufficient gas/fee
3. Retry transaction
4. Contact support if funds are locked

**Retry Guidance:** Safe to retry after 5 minutes

---

### BRIDGE_RATE_LIMITED
**HTTP Status:** 429  
**Severity:** warning

**Description:**  
Bridge rate limit exceeded for this time window.

**Common Causes:**
- Too many transactions in short period
- Bridge-specific rate limits
- Anti-spam protection triggered

**Resolution:**
1. Wait for rate limit window to reset
2. Reduce transaction frequency
3. Batch multiple operations if possible

**Retry Guidance:** Retry after time specified in Retry-After header

---

### BRIDGE_UNSUPPORTED_ASSET
**HTTP Status:** 400  
**Severity:** error

**Description:**  
The asset is not supported by this bridge.

**Common Causes:**
- Asset not whitelisted on bridge
- Asset recently delisted
- Wrong asset code

**Resolution:**
1. Check supported assets list for bridge
2. Verify asset code spelling
3. Use bridge that supports the asset

---

## Contract Errors

### CONTRACT_EXECUTION_FAILED
**HTTP Status:** 500  
**Severity:** critical

**Description:**  
Smart contract execution failed.

**Common Causes:**
- Contract logic error
- Insufficient gas provided
- Contract state mismatch
- Blockchain node issue

**Resolution:**
1. Check contract address is correct
2. Verify transaction parameters
3. Increase gas limit
4. Check blockchain status
5. Review contract event logs

**Retry Guidance:** May retry after verifying parameters

---

### CONTRACT_INVALID_STATE
**HTTP Status:** 400  
**Severity:** error

**Description:**  
Contract is in an invalid state for the requested operation.

**Common Causes:**
- Contract paused
- Contract in emergency mode
- Timelock not expired
- Prerequisites not met

**Resolution:**
1. Check contract status
2. Wait for prerequisites to be met
3. Verify operation is valid for current state

---

### CONTRACT_INSUFFICIENT_ALLOWANCE
**HTTP Status:** 400  
**Severity:** error

**Description:**  
Token allowance is insufficient for the transaction.

**Common Causes:**
- Approval transaction not confirmed
- Allowance amount too low
- Allowance expired or revoked

**Resolution:**
1. Approve contract to spend tokens
2. Set allowance to required amount
3. Wait for approval transaction confirmation

---

## Rate Limiting Errors

### RATE_LIMIT_EXCEEDED
**HTTP Status:** 429  
**Severity:** warning

**Description:**  
API rate limit exceeded for this endpoint.

**Common Causes:**
- Too many requests in short period
- Exceeded per-minute quota
- Exceeded daily quota

**Resolution:**
1. Implement exponential backoff
2. Reduce request frequency
3. Cache responses when possible
4. Consider higher rate limit tier

**Retry Guidance:** Check Retry-After header for exact timing

**Rate Limits:**
- Anonymous: 60 requests/minute
- Authenticated: 300 requests/minute
- Premium: 1000 requests/minute

---

### RATE_LIMIT_IP_BLOCKED
**HTTP Status:** 403  
**Severity:** error

**Description:**  
IP address temporarily blocked due to excessive requests.

**Common Causes:**
- Sustained rate limit violations
- Automated scanning detected
- Malicious activity flagged

**Resolution:**
1. Wait for automatic unblock (typically 1 hour)
2. Review request patterns
3. Implement proper rate limiting
4. Contact support if block persists

**Retry Guidance:** Wait at least 1 hour before retrying

---

## System Errors

### SYSTEM_INTERNAL_ERROR
**HTTP Status:** 500  
**Severity:** critical

**Description:**  
An unexpected internal error occurred.

**Common Causes:**
- Unhandled exception
- Database connection failure
- Service dependency unavailable
- Bug in application code

**Resolution:**
1. Retry request after brief delay
2. Check system status page
3. Contact support if error persists
4. Provide request ID for investigation

**Retry Guidance:** Retry with exponential backoff

---

### SYSTEM_MAINTENANCE
**HTTP Status:** 503  
**Severity:** info

**Description:**  
System is undergoing scheduled maintenance.

**Common Causes:**
- Planned maintenance window
- Database migration
- System upgrade

**Resolution:**
1. Check maintenance schedule
2. Wait for maintenance to complete
3. Subscribe to status updates

**Retry Guidance:** Check Retry-After header or status page

---

### SYSTEM_OVERLOADED
**HTTP Status:** 503  
**Severity:** warning

**Description:**  
System is experiencing high load and temporarily rejecting requests.

**Common Causes:**
- Traffic spike
- Resource exhaustion
- DDoS attack mitigation

**Resolution:**
1. Retry with exponential backoff
2. Reduce request frequency
3. Use caching where possible

**Retry Guidance:** Retry after 30-60 seconds

---

### SYSTEM_DATABASE_ERROR
**HTTP Status:** 503  
**Severity:** critical

**Description:**  
Database connection or query failed.

**Common Causes:**
- Database server unavailable
- Connection pool exhausted
- Query timeout
- Database maintenance

**Resolution:**
1. Retry after brief delay
2. Check system status
3. Contact support if persistent

**Retry Guidance:** Retry after 10-30 seconds

---

## Network Errors

### NETWORK_TIMEOUT
**HTTP Status:** 504  
**Severity:** warning

**Description:**  
Request timed out waiting for upstream service.

**Common Causes:**
- Blockchain node slow to respond
- External API timeout
- Network congestion
- Service overloaded

**Resolution:**
1. Retry request
2. Increase client timeout if too short
3. Check service status

**Retry Guidance:** Safe to retry immediately with longer timeout

---

### NETWORK_BLOCKCHAIN_UNREACHABLE
**HTTP Status:** 503  
**Severity:** critical

**Description:**  
Unable to connect to blockchain network.

**Common Causes:**
- Blockchain node offline
- Network partition
- RPC endpoint unavailable
- Firewall blocking connection

**Resolution:**
1. Check blockchain network status
2. Wait for node to recover
3. Retry after delay

**Retry Guidance:** Retry with exponential backoff starting at 60 seconds

---

## HTTP Status Code Mapping

| Status Code | Category | Description |
|-------------|----------|-------------|
| 400 | Validation | Bad request, validation failed |
| 401 | Authentication | Authentication required or failed |
| 403 | Authorization | Permission denied |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate entry or state conflict |
| 429 | Rate Limiting | Too many requests |
| 500 | System | Internal server error |
| 503 | System/Network | Service unavailable |
| 504 | Network | Gateway timeout |

## Severity Levels

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **info** | Informational, no action needed | None |
| **warning** | Degraded but recoverable | Review and monitor |
| **error** | Operation failed | Fix parameters and retry |
| **critical** | Severe failure | Immediate attention required |

## Error Recovery Best Practices

### Retry Strategy

1. **Transient Errors (5xx):** Retry with exponential backoff
2. **Rate Limits (429):** Respect Retry-After header
3. **Validation Errors (400):** Do not retry without fixing parameters
4. **Auth Errors (401):** Refresh token then retry once

### Exponential Backoff Formula

```
wait_time = base_delay * (2 ^ attempt_number) + random_jitter
```

Example: 1s, 2s, 4s, 8s, 16s (max)

### Logging and Monitoring

- Log error codes for analysis
- Track error frequency by code
- Alert on critical errors
- Monitor retry success rates

## Deprecated Error Codes

Error codes removed in previous versions:

| Code | Replaced By | Removed In |
|------|-------------|------------|
| `AUTH_BAD_TOKEN` | `AUTH_INVALID_TOKEN` | v1.2.0 |
| `BRIDGE_ERROR` | `BRIDGE_TRANSACTION_FAILED` | v1.3.0 |

## Getting Help

For questions about error codes:
- Documentation: https://docs.bridge-watch.example.com/errors
- GitHub Issues: https://github.com/StellaBridge/Bridge-Watch/issues
- Support: support@bridge-watch.example.com

When reporting errors, include:
- Error code and message
- Request ID (from X-Request-ID header)
- Timestamp
- Steps to reproduce
