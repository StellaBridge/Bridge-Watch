# \AlertsAPI

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**ApiV1AlertsHistoryAssetCodeGet**](AlertsAPI.md#ApiV1AlertsHistoryAssetCodeGet) | **Get** /api/v1/alerts/history/{assetCode} | Get alert history for an asset
[**ApiV1AlertsHistoryGet**](AlertsAPI.md#ApiV1AlertsHistoryGet) | **Get** /api/v1/alerts/history | Get paginated alert history
[**ApiV1AlertsRecentGet**](AlertsAPI.md#ApiV1AlertsRecentGet) | **Get** /api/v1/alerts/recent | Get most recent alert events
[**ApiV1AlertsRulesBulkDelete**](AlertsAPI.md#ApiV1AlertsRulesBulkDelete) | **Delete** /api/v1/alerts/rules/bulk | Bulk delete alert rules
[**ApiV1AlertsRulesBulkPatch**](AlertsAPI.md#ApiV1AlertsRulesBulkPatch) | **Patch** /api/v1/alerts/rules/bulk | Bulk update alert rules
[**ApiV1AlertsRulesBulkPost**](AlertsAPI.md#ApiV1AlertsRulesBulkPost) | **Post** /api/v1/alerts/rules/bulk | Bulk create alert rules
[**ApiV1AlertsRulesGet**](AlertsAPI.md#ApiV1AlertsRulesGet) | **Get** /api/v1/alerts/rules | List alert rules for an owner
[**ApiV1AlertsRulesPost**](AlertsAPI.md#ApiV1AlertsRulesPost) | **Post** /api/v1/alerts/rules | Create an alert rule
[**ApiV1AlertsRulesRuleIdActivePatch**](AlertsAPI.md#ApiV1AlertsRulesRuleIdActivePatch) | **Patch** /api/v1/alerts/rules/{ruleId}/active | Pause or resume an alert rule
[**ApiV1AlertsRulesRuleIdDelete**](AlertsAPI.md#ApiV1AlertsRulesRuleIdDelete) | **Delete** /api/v1/alerts/rules/{ruleId} | Delete an alert rule
[**ApiV1AlertsRulesRuleIdEventsGet**](AlertsAPI.md#ApiV1AlertsRulesRuleIdEventsGet) | **Get** /api/v1/alerts/rules/{ruleId}/events | Get events fired by a specific rule
[**ApiV1AlertsRulesRuleIdGet**](AlertsAPI.md#ApiV1AlertsRulesRuleIdGet) | **Get** /api/v1/alerts/rules/{ruleId} | Get a single alert rule
[**ApiV1AlertsRulesRuleIdPatch**](AlertsAPI.md#ApiV1AlertsRulesRuleIdPatch) | **Patch** /api/v1/alerts/rules/{ruleId} | Update an alert rule
[**ApiV1AlertsStatsGet**](AlertsAPI.md#ApiV1AlertsStatsGet) | **Get** /api/v1/alerts/stats | Get alert statistics for an owner
[**ApiV1AlertsTestPost**](AlertsAPI.md#ApiV1AlertsTestPost) | **Post** /api/v1/alerts/test | Dry-run an alert rule against current metrics



## ApiV1AlertsHistoryAssetCodeGet

> ApiV1AlertsHistoryAssetCodeGet(ctx, assetCode).Limit(limit).Execute()

Get alert history for an asset

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
	assetCode := "assetCode_example" // string | 
	limit := int32(56) // int32 |  (optional) (default to 50)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsHistoryAssetCodeGet(context.Background(), assetCode).Limit(limit).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsHistoryAssetCodeGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**assetCode** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsHistoryAssetCodeGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **limit** | **int32** |  | [default to 50]

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


## ApiV1AlertsHistoryGet

> ApiV1AlertsHistoryGet(ctx).Page(page).Limit(limit).Execute()

Get paginated alert history

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
	page := int32(56) // int32 |  (optional) (default to 1)
	limit := int32(56) // int32 |  (optional) (default to 20)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsHistoryGet(context.Background()).Page(page).Limit(limit).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsHistoryGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsHistoryGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int32** |  | [default to 1]
 **limit** | **int32** |  | [default to 20]

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


## ApiV1AlertsRecentGet

> ApiV1AlertsRecentGet(ctx).Limit(limit).Execute()

Get most recent alert events

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
	limit := int32(56) // int32 |  (optional) (default to 100)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRecentGet(context.Background()).Limit(limit).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRecentGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRecentGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int32** |  | [default to 100]

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


## ApiV1AlertsRulesBulkDelete

> ApiV1AlertsRulesBulkDelete(ctx).Body(body).Execute()

Bulk delete alert rules

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
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesBulkDelete(context.Background()).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesBulkDelete``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesBulkDeleteRequest struct via the builder pattern


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


## ApiV1AlertsRulesBulkPatch

> ApiV1AlertsRulesBulkPatch(ctx).Body(body).Execute()

Bulk update alert rules

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
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesBulkPatch(context.Background()).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesBulkPatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesBulkPatchRequest struct via the builder pattern


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


## ApiV1AlertsRulesBulkPost

> ApiV1AlertsRulesBulkPost(ctx).Body(body).Execute()

Bulk create alert rules

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
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesBulkPost(context.Background()).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesBulkPost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesBulkPostRequest struct via the builder pattern


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


## ApiV1AlertsRulesGet

> ApiV1AlertsRulesGet(ctx).Owner(owner).Execute()

List alert rules for an owner

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
	owner := "owner_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesGet(context.Background()).Owner(owner).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **owner** | **string** |  | 

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


## ApiV1AlertsRulesPost

> ApiV1AlertsRulesPost(ctx).ApiV1AlertsRulesPostRequest(apiV1AlertsRulesPostRequest).Execute()

Create an alert rule

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
	apiV1AlertsRulesPostRequest := *openapiclient.NewApiV1AlertsRulesPostRequest("OwnerAddress_example", "USDC health drop", "USDC", []map[string]interface{}{map[string]interface{}(123)}) // ApiV1AlertsRulesPostRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesPost(context.Background()).ApiV1AlertsRulesPostRequest(apiV1AlertsRulesPostRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesPost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesPostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **apiV1AlertsRulesPostRequest** | [**ApiV1AlertsRulesPostRequest**](ApiV1AlertsRulesPostRequest.md) |  | 

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


## ApiV1AlertsRulesRuleIdActivePatch

> ApiV1AlertsRulesRuleIdActivePatch(ctx, ruleId).ApiV1AlertsRulesRuleIdActivePatchRequest(apiV1AlertsRulesRuleIdActivePatchRequest).Execute()

Pause or resume an alert rule

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
	ruleId := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 
	apiV1AlertsRulesRuleIdActivePatchRequest := *openapiclient.NewApiV1AlertsRulesRuleIdActivePatchRequest("OwnerAddress_example", false) // ApiV1AlertsRulesRuleIdActivePatchRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesRuleIdActivePatch(context.Background(), ruleId).ApiV1AlertsRulesRuleIdActivePatchRequest(apiV1AlertsRulesRuleIdActivePatchRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesRuleIdActivePatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**ruleId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesRuleIdActivePatchRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **apiV1AlertsRulesRuleIdActivePatchRequest** | [**ApiV1AlertsRulesRuleIdActivePatchRequest**](ApiV1AlertsRulesRuleIdActivePatchRequest.md) |  | 

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


## ApiV1AlertsRulesRuleIdDelete

> ApiV1AlertsRulesRuleIdDelete(ctx, ruleId).ApiV1AlertsRulesRuleIdDeleteRequest(apiV1AlertsRulesRuleIdDeleteRequest).Execute()

Delete an alert rule

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
	ruleId := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 
	apiV1AlertsRulesRuleIdDeleteRequest := *openapiclient.NewApiV1AlertsRulesRuleIdDeleteRequest("OwnerAddress_example") // ApiV1AlertsRulesRuleIdDeleteRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesRuleIdDelete(context.Background(), ruleId).ApiV1AlertsRulesRuleIdDeleteRequest(apiV1AlertsRulesRuleIdDeleteRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesRuleIdDelete``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**ruleId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesRuleIdDeleteRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **apiV1AlertsRulesRuleIdDeleteRequest** | [**ApiV1AlertsRulesRuleIdDeleteRequest**](ApiV1AlertsRulesRuleIdDeleteRequest.md) |  | 

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


## ApiV1AlertsRulesRuleIdEventsGet

> ApiV1AlertsRulesRuleIdEventsGet(ctx, ruleId).Limit(limit).Execute()

Get events fired by a specific rule

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
	ruleId := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 
	limit := int32(56) // int32 |  (optional) (default to 50)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesRuleIdEventsGet(context.Background(), ruleId).Limit(limit).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesRuleIdEventsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**ruleId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesRuleIdEventsGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **limit** | **int32** |  | [default to 50]

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


## ApiV1AlertsRulesRuleIdGet

> ApiV1AlertsRulesRuleIdGet(ctx, ruleId).Execute()

Get a single alert rule

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
	ruleId := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesRuleIdGet(context.Background(), ruleId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesRuleIdGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**ruleId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesRuleIdGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


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


## ApiV1AlertsRulesRuleIdPatch

> ApiV1AlertsRulesRuleIdPatch(ctx, ruleId).Body(body).Execute()

Update an alert rule

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
	ruleId := "38400000-8cf0-11bd-b23e-10b96e4ef00d" // string | 
	body := map[string]interface{}{ ... } // map[string]interface{} | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsRulesRuleIdPatch(context.Background(), ruleId).Body(body).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsRulesRuleIdPatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**ruleId** | **string** |  | 

### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsRulesRuleIdPatchRequest struct via the builder pattern


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


## ApiV1AlertsStatsGet

> ApiV1AlertsStatsGet(ctx).Owner(owner).Execute()

Get alert statistics for an owner

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
	owner := "owner_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsStatsGet(context.Background()).Owner(owner).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsStatsGet``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsStatsGetRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **owner** | **string** |  | 

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


## ApiV1AlertsTestPost

> ApiV1AlertsTestPost(ctx).ApiV1AlertsTestPostRequest(apiV1AlertsTestPostRequest).Execute()

Dry-run an alert rule against current metrics

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
	apiV1AlertsTestPostRequest := *openapiclient.NewApiV1AlertsTestPostRequest(map[string]interface{}(123), map[string]interface{}(123)) // ApiV1AlertsTestPostRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	r, err := apiClient.AlertsAPI.ApiV1AlertsTestPost(context.Background()).ApiV1AlertsTestPostRequest(apiV1AlertsTestPostRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `AlertsAPI.ApiV1AlertsTestPost``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiApiV1AlertsTestPostRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **apiV1AlertsTestPostRequest** | [**ApiV1AlertsTestPostRequest**](ApiV1AlertsTestPostRequest.md) |  | 

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

