# \CacheAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1CacheInvalidatePost**](CacheAPI.md#ApiV1CacheInvalidatePost) | **Post** /api/v1/cache/invalidate | Invalidate cache entries
[**ApiV1CacheStatsGet**](CacheAPI.md#ApiV1CacheStatsGet) | **Get** /api/v1/cache/stats | Get Redis cache statistics
[**ApiV1MetricsRateLimitsGet**](CacheAPI.md#ApiV1MetricsRateLimitsGet) | **Get** /api/v1/metrics/rate-limits | Rate-limit sliding-window metrics



## ApiV1CacheInvalidatePost

> ApiV1CacheInvalidatePost(ctx).ApiV1CacheInvalidatePostRequest(apiV1CacheInvalidatePostRequest).Execute()

Invalidate cache entries

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	apiV1CacheInvalidatePostRequest := *openapiclient.NewApiV1CacheInvalidatePostRequest() // ApiV1CacheInvalidatePostRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CacheAPI.ApiV1CacheInvalidatePost(context.Background()).ApiV1CacheInvalidatePostRequest(apiV1CacheInvalidatePostRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CacheAPI.ApiV1CacheInvalidatePost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CacheInvalidatePostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **apiV1CacheInvalidatePostRequest** | [**ApiV1CacheInvalidatePostRequest**](ApiV1CacheInvalidatePostRequest.md) |  | 

### Return type

 (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ApiV1CacheStatsGet

> ApiV1CacheStatsGet(ctx).Execute()

Get Redis cache statistics

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CacheAPI.ApiV1CacheStatsGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CacheAPI.ApiV1CacheStatsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CacheStatsGetRequest struct via the builder pattern


### Return type

 (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ApiV1MetricsRateLimitsGet

> ApiV1MetricsRateLimitsGet(ctx).Execute()

Rate-limit sliding-window metrics

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CacheAPI.ApiV1MetricsRateLimitsGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CacheAPI.ApiV1MetricsRateLimitsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1MetricsRateLimitsGetRequest struct via the builder pattern


### Return type

 (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)

