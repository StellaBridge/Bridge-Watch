# \PreferencesAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1PreferencesUserIdBulkPatch**](PreferencesAPI.md#ApiV1PreferencesUserIdBulkPatch) | **Patch** /api/v1/preferences/{userId}/bulk | Bulk update preferences
[**ApiV1PreferencesUserIdCategoryKeyDelete**](PreferencesAPI.md#ApiV1PreferencesUserIdCategoryKeyDelete) | **Delete** /api/v1/preferences/{userId}/{category}/{key} | Reset (delete) a preference key
[**ApiV1PreferencesUserIdCategoryKeyGet**](PreferencesAPI.md#ApiV1PreferencesUserIdCategoryKeyGet) | **Get** /api/v1/preferences/{userId}/{category}/{key} | Get a single preference value
[**ApiV1PreferencesUserIdCategoryKeyPut**](PreferencesAPI.md#ApiV1PreferencesUserIdCategoryKeyPut) | **Put** /api/v1/preferences/{userId}/{category}/{key} | Set a preference value
[**ApiV1PreferencesUserIdExportGet**](PreferencesAPI.md#ApiV1PreferencesUserIdExportGet) | **Get** /api/v1/preferences/{userId}/export | Export user preferences
[**ApiV1PreferencesUserIdGet**](PreferencesAPI.md#ApiV1PreferencesUserIdGet) | **Get** /api/v1/preferences/{userId} | Get all preferences for a user
[**ApiV1PreferencesUserIdImportPost**](PreferencesAPI.md#ApiV1PreferencesUserIdImportPost) | **Post** /api/v1/preferences/{userId}/import | Import user preferences
[**ApiV1PreferencesUserIdStreamGet**](PreferencesAPI.md#ApiV1PreferencesUserIdStreamGet) | **Get** /api/v1/preferences/{userId}/stream | Stream preference change events (SSE)



## ApiV1PreferencesUserIdBulkPatch

> ApiV1PreferencesUserIdBulkPatch(ctx, userId).Body(body).Execute()

Bulk update preferences

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
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdBulkPatch(context.Background(), userId).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdBulkPatch``: %v\n", err)
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

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdBulkPatchRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdCategoryKeyDelete

> ApiV1PreferencesUserIdCategoryKeyDelete(ctx, userId, category, key).Execute()

Reset (delete) a preference key

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
	category := "category_example" // string | 
	key := "key_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyDelete(context.Background(), userId, category, key).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyDelete``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 
**category** | **string** |  | 
**key** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdCategoryKeyDeleteRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdCategoryKeyGet

> ApiV1PreferencesUserIdCategoryKeyGet(ctx, userId, category, key).Execute()

Get a single preference value

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
	category := "category_example" // string | 
	key := "key_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyGet(context.Background(), userId, category, key).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 
**category** | **string** |  | 
**key** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdCategoryKeyGetRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdCategoryKeyPut

> ApiV1PreferencesUserIdCategoryKeyPut(ctx, userId, category, key).ApiV1PreferencesUserIdCategoryKeyPutRequest(apiV1PreferencesUserIdCategoryKeyPutRequest).Execute()

Set a preference value

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
	category := "category_example" // string | 
	key := "key_example" // string | 
	apiV1PreferencesUserIdCategoryKeyPutRequest := *openapiclient.NewApiV1PreferencesUserIdCategoryKeyPutRequest(interface{}(123)) // ApiV1PreferencesUserIdCategoryKeyPutRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyPut(context.Background(), userId, category, key).ApiV1PreferencesUserIdCategoryKeyPutRequest(apiV1PreferencesUserIdCategoryKeyPutRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdCategoryKeyPut``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**userId** | **string** |  | 
**category** | **string** |  | 
**key** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdCategoryKeyPutRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------



 **apiV1PreferencesUserIdCategoryKeyPutRequest** | [**ApiV1PreferencesUserIdCategoryKeyPutRequest**](ApiV1PreferencesUserIdCategoryKeyPutRequest.md) |  | 

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


## ApiV1PreferencesUserIdExportGet

> ApiV1PreferencesUserIdExportGet(ctx, userId).Execute()

Export user preferences

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
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdExportGet(context.Background(), userId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdExportGet``: %v\n", err)
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

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdExportGetRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdGet

> ApiV1PreferencesUserIdGet(ctx, userId).Execute()

Get all preferences for a user

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
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdGet(context.Background(), userId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdGet``: %v\n", err)
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

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdGetRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdImportPost

> ApiV1PreferencesUserIdImportPost(ctx, userId).Body(body).Execute()

Import user preferences

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
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdImportPost(context.Background(), userId).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdImportPost``: %v\n", err)
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

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdImportPostRequest struct via the builder pattern


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


## ApiV1PreferencesUserIdStreamGet

> ApiV1PreferencesUserIdStreamGet(ctx, userId).Execute()

Stream preference change events (SSE)

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
	r, err := apiClient.PreferencesAPI.ApiV1PreferencesUserIdStreamGet(context.Background(), userId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PreferencesAPI.ApiV1PreferencesUserIdStreamGet``: %v\n", err)
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

Other parameters are passed through a pointer to a apiApiV1PreferencesUserIdStreamGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

 (empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: text/event-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)

