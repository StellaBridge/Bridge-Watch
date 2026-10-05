# bridge_watch_client.CircuitBreakerApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_circuit_breaker_pause_post**](CircuitBreakerApi.md#api_v1_circuit_breaker_pause_post) | **POST** /api/v1/circuit-breaker/pause | Pause a scope (not yet implemented — requires guardian auth)
[**api_v1_circuit_breaker_recovery_post**](CircuitBreakerApi.md#api_v1_circuit_breaker_recovery_post) | **POST** /api/v1/circuit-breaker/recovery | Recover from a pause (not yet implemented — requires guardian auth)
[**api_v1_circuit_breaker_status_get**](CircuitBreakerApi.md#api_v1_circuit_breaker_status_get) | **GET** /api/v1/circuit-breaker/status | Check circuit-breaker pause status
[**api_v1_circuit_breaker_whitelist_get**](CircuitBreakerApi.md#api_v1_circuit_breaker_whitelist_get) | **GET** /api/v1/circuit-breaker/whitelist | Check whitelist status


# **api_v1_circuit_breaker_pause_post**
> api_v1_circuit_breaker_pause_post(body)

Pause a scope (not yet implemented — requires guardian auth)

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
    api_instance = bridge_watch_client.CircuitBreakerApi(api_client)
    body = None # object | 

    try:
        # Pause a scope (not yet implemented — requires guardian auth)
        api_instance.api_v1_circuit_breaker_pause_post(body)
    except Exception as e:
        print("Exception when calling CircuitBreakerApi->api_v1_circuit_breaker_pause_post: %s\n" % e)
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
**501** | Not implemented |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_circuit_breaker_recovery_post**
> api_v1_circuit_breaker_recovery_post(body)

Recover from a pause (not yet implemented — requires guardian auth)

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
    api_instance = bridge_watch_client.CircuitBreakerApi(api_client)
    body = None # object | 

    try:
        # Recover from a pause (not yet implemented — requires guardian auth)
        api_instance.api_v1_circuit_breaker_recovery_post(body)
    except Exception as e:
        print("Exception when calling CircuitBreakerApi->api_v1_circuit_breaker_recovery_post: %s\n" % e)
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
**501** | Not implemented |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_circuit_breaker_status_get**
> api_v1_circuit_breaker_status_get(scope, identifier=identifier)

Check circuit-breaker pause status

### Example


```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)


# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.CircuitBreakerApi(api_client)
    scope = 'scope_example' # str | 
    identifier = 'identifier_example' # str |  (optional)

    try:
        # Check circuit-breaker pause status
        api_instance.api_v1_circuit_breaker_status_get(scope, identifier=identifier)
    except Exception as e:
        print("Exception when calling CircuitBreakerApi->api_v1_circuit_breaker_status_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **scope** | **str**|  | 
 **identifier** | **str**|  | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Pause status |  -  |
**400** | Invalid scope |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_circuit_breaker_whitelist_get**
> api_v1_circuit_breaker_whitelist_get(type, address=address, asset=asset)

Check whitelist status

### Example


```python
import bridge_watch_client
from bridge_watch_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost:3000
# See configuration.py for a list of all supported configuration parameters.
configuration = bridge_watch_client.Configuration(
    host = "http://localhost:3000"
)


# Enter a context with an instance of the API client
with bridge_watch_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = bridge_watch_client.CircuitBreakerApi(api_client)
    type = 'type_example' # str | 
    address = 'address_example' # str |  (optional)
    asset = 'asset_example' # str |  (optional)

    try:
        # Check whitelist status
        api_instance.api_v1_circuit_breaker_whitelist_get(type, address=address, asset=asset)
    except Exception as e:
        print("Exception when calling CircuitBreakerApi->api_v1_circuit_breaker_whitelist_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type** | **str**|  | 
 **address** | **str**|  | [optional] 
 **asset** | **str**|  | [optional] 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Whitelist status |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

