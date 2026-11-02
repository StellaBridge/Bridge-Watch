# bridge_watch_client.AlertsApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_alerts_history_asset_code_get**](AlertsApi.md#api_v1_alerts_history_asset_code_get) | **GET** /api/v1/alerts/history/{assetCode} | Get alert history for an asset
[**api_v1_alerts_history_get**](AlertsApi.md#api_v1_alerts_history_get) | **GET** /api/v1/alerts/history | Get paginated alert history
[**api_v1_alerts_recent_get**](AlertsApi.md#api_v1_alerts_recent_get) | **GET** /api/v1/alerts/recent | Get most recent alert events
[**api_v1_alerts_rules_bulk_delete**](AlertsApi.md#api_v1_alerts_rules_bulk_delete) | **DELETE** /api/v1/alerts/rules/bulk | Bulk delete alert rules
[**api_v1_alerts_rules_bulk_patch**](AlertsApi.md#api_v1_alerts_rules_bulk_patch) | **PATCH** /api/v1/alerts/rules/bulk | Bulk update alert rules
[**api_v1_alerts_rules_bulk_post**](AlertsApi.md#api_v1_alerts_rules_bulk_post) | **POST** /api/v1/alerts/rules/bulk | Bulk create alert rules
[**api_v1_alerts_rules_get**](AlertsApi.md#api_v1_alerts_rules_get) | **GET** /api/v1/alerts/rules | List alert rules for an owner
[**api_v1_alerts_rules_post**](AlertsApi.md#api_v1_alerts_rules_post) | **POST** /api/v1/alerts/rules | Create an alert rule
[**api_v1_alerts_rules_rule_id_active_patch**](AlertsApi.md#api_v1_alerts_rules_rule_id_active_patch) | **PATCH** /api/v1/alerts/rules/{ruleId}/active | Pause or resume an alert rule
[**api_v1_alerts_rules_rule_id_delete**](AlertsApi.md#api_v1_alerts_rules_rule_id_delete) | **DELETE** /api/v1/alerts/rules/{ruleId} | Delete an alert rule
[**api_v1_alerts_rules_rule_id_events_get**](AlertsApi.md#api_v1_alerts_rules_rule_id_events_get) | **GET** /api/v1/alerts/rules/{ruleId}/events | Get events fired by a specific rule
[**api_v1_alerts_rules_rule_id_get**](AlertsApi.md#api_v1_alerts_rules_rule_id_get) | **GET** /api/v1/alerts/rules/{ruleId} | Get a single alert rule
[**api_v1_alerts_rules_rule_id_patch**](AlertsApi.md#api_v1_alerts_rules_rule_id_patch) | **PATCH** /api/v1/alerts/rules/{ruleId} | Update an alert rule
[**api_v1_alerts_stats_get**](AlertsApi.md#api_v1_alerts_stats_get) | **GET** /api/v1/alerts/stats | Get alert statistics for an owner
[**api_v1_alerts_test_post**](AlertsApi.md#api_v1_alerts_test_post) | **POST** /api/v1/alerts/test | Dry-run an alert rule against current metrics


# **api_v1_alerts_history_asset_code_get**
> api_v1_alerts_history_asset_code_get(asset_code, limit=limit)

Get alert history for an asset

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    asset_code = 'asset_code_example' # str | 
    limit = 50 # int |  (optional) (default to 50)

    try:
        # Get alert history for an asset
        api_instance.api_v1_alerts_history_asset_code_get(asset_code, limit=limit)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_history_asset_code_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **asset_code** | **str**|  | 
 **limit** | **int**|  | [optional] [default to 50]

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Asset alert history |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_history_get**
> api_v1_alerts_history_get(page=page, limit=limit)

Get paginated alert history

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    page = 1 # int |  (optional) (default to 1)
    limit = 20 # int |  (optional) (default to 20)

    try:
        # Get paginated alert history
        api_instance.api_v1_alerts_history_get(page=page, limit=limit)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_history_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int**|  | [optional] [default to 1]
 **limit** | **int**|  | [optional] [default to 20]

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Paginated alert history |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_recent_get**
> api_v1_alerts_recent_get(limit=limit)

Get most recent alert events

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    limit = 100 # int |  (optional) (default to 100)

    try:
        # Get most recent alert events
        api_instance.api_v1_alerts_recent_get(limit=limit)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_recent_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int**|  | [optional] [default to 100]

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Recent events |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_bulk_delete**
> api_v1_alerts_rules_bulk_delete(body)

Bulk delete alert rules

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    body = None # object | 

    try:
        # Bulk delete alert rules
        api_instance.api_v1_alerts_rules_bulk_delete(body)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_bulk_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **object**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Rules deleted |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_bulk_patch**
> api_v1_alerts_rules_bulk_patch(body)

Bulk update alert rules

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    body = None # object | 

    try:
        # Bulk update alert rules
        api_instance.api_v1_alerts_rules_bulk_patch(body)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_bulk_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **object**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Rules updated |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_bulk_post**
> api_v1_alerts_rules_bulk_post(body)

Bulk create alert rules

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    body = None # object | 

    try:
        # Bulk create alert rules
        api_instance.api_v1_alerts_rules_bulk_post(body)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_bulk_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **object**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**201** | Rules created |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_get**
> api_v1_alerts_rules_get(owner)

List alert rules for an owner

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    owner = 'owner_example' # str | 

    try:
        # List alert rules for an owner
        api_instance.api_v1_alerts_rules_get(owner)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **owner** | **str**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Alert rules |  -  |
**400** | Missing owner param |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_post**
> api_v1_alerts_rules_post(api_v1_alerts_rules_post_request)

Create an alert rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_alerts_rules_post_request import ApiV1AlertsRulesPostRequest
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    api_v1_alerts_rules_post_request = bridge_watch_client.ApiV1AlertsRulesPostRequest() # ApiV1AlertsRulesPostRequest | 

    try:
        # Create an alert rule
        api_instance.api_v1_alerts_rules_post(api_v1_alerts_rules_post_request)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **api_v1_alerts_rules_post_request** | [**ApiV1AlertsRulesPostRequest**](ApiV1AlertsRulesPostRequest.md)|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**201** | Rule created |  -  |
**400** | Validation error |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_rule_id_active_patch**
> api_v1_alerts_rules_rule_id_active_patch(rule_id, api_v1_alerts_rules_rule_id_active_patch_request)

Pause or resume an alert rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_alerts_rules_rule_id_active_patch_request import ApiV1AlertsRulesRuleIdActivePatchRequest
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    rule_id = 'rule_id_example' # str | 
    api_v1_alerts_rules_rule_id_active_patch_request = bridge_watch_client.ApiV1AlertsRulesRuleIdActivePatchRequest() # ApiV1AlertsRulesRuleIdActivePatchRequest | 

    try:
        # Pause or resume an alert rule
        api_instance.api_v1_alerts_rules_rule_id_active_patch(rule_id, api_v1_alerts_rules_rule_id_active_patch_request)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_rule_id_active_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rule_id** | **str**|  | 
 **api_v1_alerts_rules_rule_id_active_patch_request** | [**ApiV1AlertsRulesRuleIdActivePatchRequest**](ApiV1AlertsRulesRuleIdActivePatchRequest.md)|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Success |  -  |
**401** | Unauthorized |  -  |
**404** | Rule not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_rule_id_delete**
> api_v1_alerts_rules_rule_id_delete(rule_id, api_v1_alerts_rules_rule_id_delete_request)

Delete an alert rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_alerts_rules_rule_id_delete_request import ApiV1AlertsRulesRuleIdDeleteRequest
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    rule_id = 'rule_id_example' # str | 
    api_v1_alerts_rules_rule_id_delete_request = bridge_watch_client.ApiV1AlertsRulesRuleIdDeleteRequest() # ApiV1AlertsRulesRuleIdDeleteRequest | 

    try:
        # Delete an alert rule
        api_instance.api_v1_alerts_rules_rule_id_delete(rule_id, api_v1_alerts_rules_rule_id_delete_request)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_rule_id_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rule_id** | **str**|  | 
 **api_v1_alerts_rules_rule_id_delete_request** | [**ApiV1AlertsRulesRuleIdDeleteRequest**](ApiV1AlertsRulesRuleIdDeleteRequest.md)|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**204** | Rule deleted |  -  |
**401** | Unauthorized |  -  |
**404** | Rule not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_rule_id_events_get**
> api_v1_alerts_rules_rule_id_events_get(rule_id, limit=limit)

Get events fired by a specific rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    rule_id = 'rule_id_example' # str | 
    limit = 50 # int |  (optional) (default to 50)

    try:
        # Get events fired by a specific rule
        api_instance.api_v1_alerts_rules_rule_id_events_get(rule_id, limit=limit)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_rule_id_events_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rule_id** | **str**|  | 
 **limit** | **int**|  | [optional] [default to 50]

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Rule events |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_rule_id_get**
> api_v1_alerts_rules_rule_id_get(rule_id)

Get a single alert rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    rule_id = 'rule_id_example' # str | 

    try:
        # Get a single alert rule
        api_instance.api_v1_alerts_rules_rule_id_get(rule_id)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_rule_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rule_id** | **str**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Alert rule |  -  |
**401** | Unauthorized |  -  |
**404** | Rule not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_rules_rule_id_patch**
> api_v1_alerts_rules_rule_id_patch(rule_id, body)

Update an alert rule

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    rule_id = 'rule_id_example' # str | 
    body = None # object | 

    try:
        # Update an alert rule
        api_instance.api_v1_alerts_rules_rule_id_patch(rule_id, body)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_rules_rule_id_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **rule_id** | **str**|  | 
 **body** | **object**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Updated rule |  -  |
**401** | Unauthorized |  -  |
**404** | Rule not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_stats_get**
> api_v1_alerts_stats_get(owner)

Get alert statistics for an owner

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    owner = 'owner_example' # str | 

    try:
        # Get alert statistics for an owner
        api_instance.api_v1_alerts_stats_get(owner)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_stats_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **owner** | **str**|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Alert stats |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_alerts_test_post**
> api_v1_alerts_test_post(api_v1_alerts_test_post_request)

Dry-run an alert rule against current metrics

### Example

* Api Key Authentication (ApiKeyAuth):

```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_alerts_test_post_request import ApiV1AlertsTestPostRequest
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure API key authorization: ApiKeyAuth
configuration.api_key['ApiKeyAuth'] = os.environ["API_KEY"]

# Uncomment below to setup prefix (e.g. Bearer) for API key, if needed
# configuration.api_key_prefix['ApiKeyAuth'] = 'Bearer'

# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.AlertsApi(api_client)
    api_v1_alerts_test_post_request = bridge_watch_client.ApiV1AlertsTestPostRequest() # ApiV1AlertsTestPostRequest | 

    try:
        # Dry-run an alert rule against current metrics
        api_instance.api_v1_alerts_test_post(api_v1_alerts_test_post_request)
    except Exception as e:
        print("Exception when calling AlertsApi->api_v1_alerts_test_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **api_v1_alerts_test_post_request** | [**ApiV1AlertsTestPostRequest**](ApiV1AlertsTestPostRequest.md)|  | 

### Return type

void (empty response body)

### Authorization

[ApiKeyAuth](../README.md#ApiKeyAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Dry-run result |  -  |
**401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

