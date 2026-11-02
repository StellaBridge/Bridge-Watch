# \WatchlistsAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1WatchlistsUserIdGet**](WatchlistsAPI.md#ApiV1WatchlistsUserIdGet) | **Get** /api/v1/watchlists/{userId} | Get all watchlists for a user
[**ApiV1WatchlistsUserIdIdDelete**](WatchlistsAPI.md#ApiV1WatchlistsUserIdIdDelete) | **Delete** /api/v1/watchlists/{userId}/{id} | Delete a watchlist
[**ApiV1WatchlistsUserIdIdPatch**](WatchlistsAPI.md#ApiV1WatchlistsUserIdIdPatch) | **Patch** /api/v1/watchlists/{userId}/{id} | Update a watchlist
[**ApiV1WatchlistsUserIdPost**](WatchlistsAPI.md#ApiV1WatchlistsUserIdPost) | **Post** /api/v1/watchlists/{userId} | Create a watchlist



## ApiV1WatchlistsUserIdGet

> ApiV1WatchlistsUserIdGet(ctx, userId).Execute()

Get all watchlists for a user

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
	userId := "userId_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.WatchlistsAPI.ApiV1WatchlistsUserIdGet(context.Background(), userId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `WatchlistsAPI.ApiV1WatchlistsUserIdGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1WatchlistsUserIdGetRequest struct via the builder pattern


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


## ApiV1WatchlistsUserIdIdDelete

> ApiV1WatchlistsUserIdIdDelete(ctx, userId, id).Execute()

Delete a watchlist

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
	userId := "userId_example" // string | 
	id := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.WatchlistsAPI.ApiV1WatchlistsUserIdIdDelete(context.Background(), userId, id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `WatchlistsAPI.ApiV1WatchlistsUserIdIdDelete``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 
**id** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1WatchlistsUserIdIdDeleteRequest struct via the builder pattern


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


## ApiV1WatchlistsUserIdIdPatch

> ApiV1WatchlistsUserIdIdPatch(ctx, userId, id).Body(body).Execute()

Update a watchlist

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
	userId := "userId_example" // string | 
	id := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.WatchlistsAPI.ApiV1WatchlistsUserIdIdPatch(context.Background(), userId, id).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `WatchlistsAPI.ApiV1WatchlistsUserIdIdPatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 
**id** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1WatchlistsUserIdIdPatchRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


 **body** | **map[string]interface{}** |  | 

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


## ApiV1WatchlistsUserIdPost

> ApiV1WatchlistsUserIdPost(ctx, userId).ApiV1WatchlistsUserIdPostRequest(apiV1WatchlistsUserIdPostRequest).Execute()

Create a watchlist

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
	userId := "userId_example" // string | 
	apiV1WatchlistsUserIdPostRequest := *openapiclient.NewApiV1WatchlistsUserIdPostRequest("Name_example") // ApiV1WatchlistsUserIdPostRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.WatchlistsAPI.ApiV1WatchlistsUserIdPost(context.Background(), userId).ApiV1WatchlistsUserIdPostRequest(apiV1WatchlistsUserIdPostRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `WatchlistsAPI.ApiV1WatchlistsUserIdPost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1WatchlistsUserIdPostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **apiV1WatchlistsUserIdPostRequest** | [**ApiV1WatchlistsUserIdPostRequest**](ApiV1WatchlistsUserIdPostRequest.md) |  | 

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

