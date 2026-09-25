# bridge_watch_client.CacheApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_cache_invalidate_post**](CacheApi.md#api_v1_cache_invalidate_post) | **POST** /api/v1/cache/invalidate | Invalidate cache entries
[**api_v1_cache_stats_get**](CacheApi.md#api_v1_cache_stats_get) | **GET** /api/v1/cache/stats | Get Redis cache statistics
[**api_v1_metrics_rate_limits_get**](CacheApi.md#api_v1_metrics_rate_limits_get) | **GET** /api/v1/metrics/rate-limits | Rate-limit sliding-window metrics


# **api_v1_cache_invalidate_post**
> api_v1_cache_invalidate_post(api_v1_cache_invalidate_post_request)

Invalidate cache entries

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_cache_invalidate_post_request import ApiV1CacheInvalidatePostRequest
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
    api_instance = bridge_watch_client.CacheApi(api_client)
    api_v1_cache_invalidate_post_request = bridge_watch_client.ApiV1CacheInvalidatePostRequest() # ApiV1CacheInvalidatePostRequest | 

    try:
        # Invalidate cache entries
        api_instance.api_v1_cache_invalidate_post(api_v1_cache_invalidate_post_request)
    except Exception as e:
        print("Exception when calling CacheApi->api_v1_cache_invalidate_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **api_v1_cache_invalidate_post_request** | [**ApiV1CacheInvalidatePostRequest**](ApiV1CacheInvalidatePostRequest.md)|  | 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Invalidated |  -  |
**400** | Missing tag or key |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_cache_stats_get**
> api_v1_cache_stats_get()

Get Redis cache statistics

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
    api_instance = bridge_watch_client.CacheApi(api_client)

    try:
        # Get Redis cache statistics
        api_instance.api_v1_cache_stats_get()
    except Exception as e:
        print("Exception when calling CacheApi->api_v1_cache_stats_get: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

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
**200** | Cache stats |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metrics_rate_limits_get**
> api_v1_metrics_rate_limits_get()

Rate-limit sliding-window metrics

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
    api_instance = bridge_watch_client.CacheApi(api_client)

    try:
        # Rate-limit sliding-window metrics
        api_instance.api_v1_metrics_rate_limits_get()
    except Exception as e:
        print("Exception when calling CacheApi->api_v1_metrics_rate_limits_get: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

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
**200** | Rate-limit metrics |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

