# \AnalyticsAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1AnalyticsAssetsRankingsGet**](AnalyticsAPI.md#ApiV1AnalyticsAssetsRankingsGet) | **Get** /api/v1/analytics/assets/rankings | Get asset rankings
[**ApiV1AnalyticsBridgesComparisonGet**](AnalyticsAPI.md#ApiV1AnalyticsBridgesComparisonGet) | **Get** /api/v1/analytics/bridges/comparison | Get bridge comparison metrics
[**ApiV1AnalyticsCacheInvalidatePost**](AnalyticsAPI.md#ApiV1AnalyticsCacheInvalidatePost) | **Post** /api/v1/analytics/cache/invalidate | Invalidate analytics cache
[**ApiV1AnalyticsCustomMetricsGet**](AnalyticsAPI.md#ApiV1AnalyticsCustomMetricsGet) | **Get** /api/v1/analytics/custom-metrics | List all custom metrics
[**ApiV1AnalyticsCustomMetricsMetricIdGet**](AnalyticsAPI.md#ApiV1AnalyticsCustomMetricsMetricIdGet) | **Get** /api/v1/analytics/custom-metrics/{metricId} | Execute a custom metric query
[**ApiV1AnalyticsHistoricalMetricGet**](AnalyticsAPI.md#ApiV1AnalyticsHistoricalMetricGet) | **Get** /api/v1/analytics/historical/{metric} | Get historical comparison data
[**ApiV1AnalyticsProtocolGet**](AnalyticsAPI.md#ApiV1AnalyticsProtocolGet) | **Get** /api/v1/analytics/protocol | Get protocol-wide statistics
[**ApiV1AnalyticsSummaryGet**](AnalyticsAPI.md#ApiV1AnalyticsSummaryGet) | **Get** /api/v1/analytics/summary | Get comprehensive analytics summary
[**ApiV1AnalyticsTopPerformersGet**](AnalyticsAPI.md#ApiV1AnalyticsTopPerformersGet) | **Get** /api/v1/analytics/top-performers | Get top performing assets or bridges
[**ApiV1AnalyticsTrendsMetricGet**](AnalyticsAPI.md#ApiV1AnalyticsTrendsMetricGet) | **Get** /api/v1/analytics/trends/{metric} | Calculate trend for a metric
[**ApiV1AnalyticsVolumeGet**](AnalyticsAPI.md#ApiV1AnalyticsVolumeGet) | **Get** /api/v1/analytics/volume | Get volume aggregations



## ApiV1AnalyticsAssetsRankingsGet

> ApiV1AnalyticsAssetsRankingsGet(ctx).Execute()

Get asset rankings

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
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsAssetsRankingsGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsAssetsRankingsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsAssetsRankingsGetRequest struct via the builder pattern


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


## ApiV1AnalyticsBridgesComparisonGet

> ApiV1AnalyticsBridgesComparisonGet(ctx).Execute()

Get bridge comparison metrics

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
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsBridgesComparisonGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsBridgesComparisonGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsBridgesComparisonGetRequest struct via the builder pattern


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


## ApiV1AnalyticsCacheInvalidatePost

> ApiV1AnalyticsCacheInvalidatePost(ctx).ApiV1AnalyticsCacheInvalidatePostRequest(apiV1AnalyticsCacheInvalidatePostRequest).Execute()

Invalidate analytics cache

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
	apiV1AnalyticsCacheInvalidatePostRequest := *openapiclient.NewApiV1AnalyticsCacheInvalidatePostRequest() // ApiV1AnalyticsCacheInvalidatePostRequest |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsCacheInvalidatePost(context.Background()).ApiV1AnalyticsCacheInvalidatePostRequest(apiV1AnalyticsCacheInvalidatePostRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsCacheInvalidatePost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsCacheInvalidatePostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **apiV1AnalyticsCacheInvalidatePostRequest** | [**ApiV1AnalyticsCacheInvalidatePostRequest**](ApiV1AnalyticsCacheInvalidatePostRequest.md) |  | 

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


## ApiV1AnalyticsCustomMetricsGet

> ApiV1AnalyticsCustomMetricsGet(ctx).Execute()

List all custom metrics

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
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsCustomMetricsGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsCustomMetricsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsCustomMetricsGetRequest struct via the builder pattern


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


## ApiV1AnalyticsCustomMetricsMetricIdGet

> ApiV1AnalyticsCustomMetricsMetricIdGet(ctx, metricId).Execute()

Execute a custom metric query

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
	metricId := "metricId_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsCustomMetricsMetricIdGet(context.Background(), metricId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsCustomMetricsMetricIdGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**metricId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsCustomMetricsMetricIdGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


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


## ApiV1AnalyticsHistoricalMetricGet

> ApiV1AnalyticsHistoricalMetricGet(ctx, metric).Symbol(symbol).Days(days).Execute()

Get historical comparison data

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
	metric := "metric_example" // string | 
	symbol := "symbol_example" // string |  (optional)
	days := int32(56) // int32 |  (optional) (default to 30)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsHistoricalMetricGet(context.Background(), metric).Symbol(symbol).Days(days).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsHistoricalMetricGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**metric** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsHistoricalMetricGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **symbol** | **string** |  | 
 **days** | **int32** |  | [default to 30]

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


## ApiV1AnalyticsProtocolGet

> ApiV1AnalyticsProtocolGet(ctx).ForceRefresh(forceRefresh).Execute()

Get protocol-wide statistics

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
	forceRefresh := "forceRefresh_example" // string |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsProtocolGet(context.Background()).ForceRefresh(forceRefresh).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsProtocolGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsProtocolGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **forceRefresh** | **string** |  | 

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


## ApiV1AnalyticsSummaryGet

> ApiV1AnalyticsSummaryGet(ctx).Execute()

Get comprehensive analytics summary

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
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsSummaryGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsSummaryGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsSummaryGetRequest struct via the builder pattern


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


## ApiV1AnalyticsTopPerformersGet

> ApiV1AnalyticsTopPerformersGet(ctx).Type_(type_).Metric(metric).Limit(limit).Execute()

Get top performing assets or bridges

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
	type_ := "type__example" // string |  (optional) (default to "assets")
	metric := "metric_example" // string |  (optional) (default to "health")
	limit := int32(56) // int32 |  (optional) (default to 10)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsTopPerformersGet(context.Background()).Type_(type_).Metric(metric).Limit(limit).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsTopPerformersGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsTopPerformersGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type_** | **string** |  | [default to &quot;assets&quot;]
 **metric** | **string** |  | [default to &quot;health&quot;]
 **limit** | **int32** |  | [default to 10]

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


## ApiV1AnalyticsTrendsMetricGet

> ApiV1AnalyticsTrendsMetricGet(ctx, metric).Execute()

Calculate trend for a metric

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
	metric := "metric_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsTrendsMetricGet(context.Background(), metric).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsTrendsMetricGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**metric** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsTrendsMetricGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


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


## ApiV1AnalyticsVolumeGet

> ApiV1AnalyticsVolumeGet(ctx).Period(period).Symbol(symbol).BridgeName(bridgeName).Execute()

Get volume aggregations

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
	period := "period_example" // string |  (optional) (default to "daily")
	symbol := "symbol_example" // string |  (optional)
	bridgeName := "bridgeName_example" // string |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AnalyticsAPI.ApiV1AnalyticsVolumeGet(context.Background()).Period(period).Symbol(symbol).BridgeName(bridgeName).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AnalyticsAPI.ApiV1AnalyticsVolumeGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AnalyticsVolumeGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **period** | **string** |  | [default to &quot;daily&quot;]
 **symbol** | **string** |  | 
 **bridgeName** | **string** |  | 

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

