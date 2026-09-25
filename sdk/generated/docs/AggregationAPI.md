# \AggregationAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1AggregationStatsGet**](AggregationAPI.md#ApiV1AggregationStatsGet) | **Get** /api/v1/aggregation/stats | Get aggregation statistics
[**ApiV1AggregationSymbolHealthGet**](AggregationAPI.md#ApiV1AggregationSymbolHealthGet) | **Get** /api/v1/aggregation/{symbol}/health | Aggregate health scores
[**ApiV1AggregationSymbolPricesGet**](AggregationAPI.md#ApiV1AggregationSymbolPricesGet) | **Get** /api/v1/aggregation/{symbol}/prices | Aggregate price data
[**ApiV1AggregationSymbolVolumeGet**](AggregationAPI.md#ApiV1AggregationSymbolVolumeGet) | **Get** /api/v1/aggregation/{symbol}/volume | Aggregate volume data



## ApiV1AggregationStatsGet

> ApiV1AggregationStatsGet(ctx).Execute()

Get aggregation statistics

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
	r, err := apiClient.AggregationAPI.ApiV1AggregationStatsGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AggregationAPI.ApiV1AggregationStatsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AggregationStatsGetRequest struct via the builder pattern


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


## ApiV1AggregationSymbolHealthGet

> ApiV1AggregationSymbolHealthGet(ctx, symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()

Aggregate health scores

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
    "time"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	symbol := "symbol_example" // string | 
	interval := "interval_example" // string | 
	startTime := time.Now() // time.Time | 
	endTime := time.Now() // time.Time | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AggregationAPI.ApiV1AggregationSymbolHealthGet(context.Background(), symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AggregationAPI.ApiV1AggregationSymbolHealthGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**symbol** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AggregationSymbolHealthGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **interval** | **string** |  | 
 **startTime** | **time.Time** |  | 
 **endTime** | **time.Time** |  | 

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


## ApiV1AggregationSymbolPricesGet

> ApiV1AggregationSymbolPricesGet(ctx, symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()

Aggregate price data

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
    "time"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	symbol := "symbol_example" // string | 
	interval := "interval_example" // string | 
	startTime := time.Now() // time.Time | 
	endTime := time.Now() // time.Time | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AggregationAPI.ApiV1AggregationSymbolPricesGet(context.Background(), symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AggregationAPI.ApiV1AggregationSymbolPricesGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**symbol** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AggregationSymbolPricesGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **interval** | **string** |  | 
 **startTime** | **time.Time** |  | 
 **endTime** | **time.Time** |  | 

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


## ApiV1AggregationSymbolVolumeGet

> ApiV1AggregationSymbolVolumeGet(ctx, symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()

Aggregate volume data

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
    "time"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	symbol := "symbol_example" // string | 
	interval := "interval_example" // string | 
	startTime := time.Now() // time.Time | 
	endTime := time.Now() // time.Time | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AggregationAPI.ApiV1AggregationSymbolVolumeGet(context.Background(), symbol).Interval(interval).StartTime(startTime).EndTime(endTime).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AggregationAPI.ApiV1AggregationSymbolVolumeGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**symbol** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AggregationSymbolVolumeGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **interval** | **string** |  | 
 **startTime** | **time.Time** |  | 
 **endTime** | **time.Time** |  | 

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

