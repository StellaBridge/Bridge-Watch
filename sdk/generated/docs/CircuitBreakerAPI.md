# \CircuitBreakerAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1CircuitBreakerPausePost**](CircuitBreakerAPI.md#ApiV1CircuitBreakerPausePost) | **Post** /api/v1/circuit-breaker/pause | Pause a scope (not yet implemented — requires guardian auth)
[**ApiV1CircuitBreakerRecoveryPost**](CircuitBreakerAPI.md#ApiV1CircuitBreakerRecoveryPost) | **Post** /api/v1/circuit-breaker/recovery | Recover from a pause (not yet implemented — requires guardian auth)
[**ApiV1CircuitBreakerStatusGet**](CircuitBreakerAPI.md#ApiV1CircuitBreakerStatusGet) | **Get** /api/v1/circuit-breaker/status | Check circuit-breaker pause status
[**ApiV1CircuitBreakerWhitelistGet**](CircuitBreakerAPI.md#ApiV1CircuitBreakerWhitelistGet) | **Get** /api/v1/circuit-breaker/whitelist | Check whitelist status



## ApiV1CircuitBreakerPausePost

> ApiV1CircuitBreakerPausePost(ctx).Body(body).Execute()

Pause a scope (not yet implemented — requires guardian auth)

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
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CircuitBreakerAPI.ApiV1CircuitBreakerPausePost(context.Background()).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CircuitBreakerAPI.ApiV1CircuitBreakerPausePost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CircuitBreakerPausePostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **map[string]interface{}** |  | 

### Return type

 (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ApiV1CircuitBreakerRecoveryPost

> ApiV1CircuitBreakerRecoveryPost(ctx).Body(body).Execute()

Recover from a pause (not yet implemented — requires guardian auth)

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
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CircuitBreakerAPI.ApiV1CircuitBreakerRecoveryPost(context.Background()).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CircuitBreakerAPI.ApiV1CircuitBreakerRecoveryPost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CircuitBreakerRecoveryPostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **map[string]interface{}** |  | 

### Return type

 (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: Not defined

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ApiV1CircuitBreakerStatusGet

> ApiV1CircuitBreakerStatusGet(ctx).Scope(scope).Identifier(identifier).Execute()

Check circuit-breaker pause status

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
	scope := "scope_example" // string | 
	identifier := "identifier_example" // string |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CircuitBreakerAPI.ApiV1CircuitBreakerStatusGet(context.Background()).Scope(scope).Identifier(identifier).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CircuitBreakerAPI.ApiV1CircuitBreakerStatusGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CircuitBreakerStatusGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **scope** | **string** |  | 
 **identifier** | **string** |  | 

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


## ApiV1CircuitBreakerWhitelistGet

> ApiV1CircuitBreakerWhitelistGet(ctx).Type_(type_).Address(address).Asset(asset).Execute()

Check whitelist status

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
	type_ := "type__example" // string | 
	address := "address_example" // string |  (optional)
	asset := "asset_example" // string |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.CircuitBreakerAPI.ApiV1CircuitBreakerWhitelistGet(context.Background()).Type_(type_).Address(address).Asset(asset).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `CircuitBreakerAPI.ApiV1CircuitBreakerWhitelistGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1CircuitBreakerWhitelistGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type_** | **string** |  | 
 **address** | **string** |  | 
 **asset** | **string** |  | 

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

