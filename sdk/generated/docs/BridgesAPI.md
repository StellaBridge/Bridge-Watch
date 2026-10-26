# \BridgesAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1BridgesBridgeStatsGet**](BridgesAPI.md#ApiV1BridgesBridgeStatsGet) | **Get** /api/v1/bridges/{bridge}/stats | Get bridge statistics
[**ApiV1BridgesGet**](BridgesAPI.md#ApiV1BridgesGet) | **Get** /api/v1/bridges | List all bridge statuses



## ApiV1BridgesBridgeStatsGet

> ApiV1BridgesBridgeStatsGet(ctx, bridge).Execute()

Get bridge statistics

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
	bridge := "allbridge" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.BridgesAPI.ApiV1BridgesBridgeStatsGet(context.Background(), bridge).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `BridgesAPI.ApiV1BridgesBridgeStatsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**bridge** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1BridgesBridgeStatsGetRequest struct via the builder pattern


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


## ApiV1BridgesGet

> ApiV1BridgesGet(ctx).Execute()

List all bridge statuses

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
	r, err := apiClient.BridgesAPI.ApiV1BridgesGet(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `BridgesAPI.ApiV1BridgesGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1BridgesGetRequest struct via the builder pattern


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

