# bridge_watch_client.AnalyticsApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_analytics_assets_rankings_get**](AnalyticsApi.md#api_v1_analytics_assets_rankings_get) | **GET** /api/v1/analytics/assets/rankings | Get asset rankings
[**api_v1_analytics_bridges_comparison_get**](AnalyticsApi.md#api_v1_analytics_bridges_comparison_get) | **GET** /api/v1/analytics/bridges/comparison | Get bridge comparison metrics
[**api_v1_analytics_cache_invalidate_post**](AnalyticsApi.md#api_v1_analytics_cache_invalidate_post) | **POST** /api/v1/analytics/cache/invalidate | Invalidate analytics cache
[**api_v1_analytics_custom_metrics_get**](AnalyticsApi.md#api_v1_analytics_custom_metrics_get) | **GET** /api/v1/analytics/custom-metrics | List all custom metrics
[**api_v1_analytics_custom_metrics_metric_id_get**](AnalyticsApi.md#api_v1_analytics_custom_metrics_metric_id_get) | **GET** /api/v1/analytics/custom-metrics/{metricId} | Execute a custom metric query
[**api_v1_analytics_historical_metric_get**](AnalyticsApi.md#api_v1_analytics_historical_metric_get) | **GET** /api/v1/analytics/historical/{metric} | Get historical comparison data
[**api_v1_analytics_protocol_get**](AnalyticsApi.md#api_v1_analytics_protocol_get) | **GET** /api/v1/analytics/protocol | Get protocol-wide statistics
[**api_v1_analytics_summary_get**](AnalyticsApi.md#api_v1_analytics_summary_get) | **GET** /api/v1/analytics/summary | Get comprehensive analytics summary
[**api_v1_analytics_top_performers_get**](AnalyticsApi.md#api_v1_analytics_top_performers_get) | **GET** /api/v1/analytics/top-performers | Get top performing assets or bridges
[**api_v1_analytics_trends_metric_get**](AnalyticsApi.md#api_v1_analytics_trends_metric_get) | **GET** /api/v1/analytics/trends/{metric} | Calculate trend for a metric
[**api_v1_analytics_volume_get**](AnalyticsApi.md#api_v1_analytics_volume_get) | **GET** /api/v1/analytics/volume | Get volume aggregations


# **api_v1_analytics_assets_rankings_get**
> api_v1_analytics_assets_rankings_get()

Get asset rankings

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)

    try:
        # Get asset rankings
        api_instance.api_v1_analytics_assets_rankings_get()
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_assets_rankings_get: %s\n" % e)
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
**200** | Asset rankings |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_bridges_comparison_get**
> api_v1_analytics_bridges_comparison_get()

Get bridge comparison metrics

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)

    try:
        # Get bridge comparison metrics
        api_instance.api_v1_analytics_bridges_comparison_get()
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_bridges_comparison_get: %s\n" % e)
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
**200** | Bridge comparisons |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_cache_invalidate_post**
> api_v1_analytics_cache_invalidate_post(api_v1_analytics_cache_invalidate_post_request=api_v1_analytics_cache_invalidate_post_request)

Invalidate analytics cache

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_analytics_cache_invalidate_post_request import ApiV1AnalyticsCacheInvalidatePostRequest
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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    api_v1_analytics_cache_invalidate_post_request = bridge_watch_client.ApiV1AnalyticsCacheInvalidatePostRequest() # ApiV1AnalyticsCacheInvalidatePostRequest |  (optional)

    try:
        # Invalidate analytics cache
        api_instance.api_v1_analytics_cache_invalidate_post(api_v1_analytics_cache_invalidate_post_request=api_v1_analytics_cache_invalidate_post_request)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_cache_invalidate_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **api_v1_analytics_cache_invalidate_post_request** | [**ApiV1AnalyticsCacheInvalidatePostRequest**](ApiV1AnalyticsCacheInvalidatePostRequest.md)|  | [optional] 

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
**200** | Cache invalidated |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_custom_metrics_get**
> api_v1_analytics_custom_metrics_get()

List all custom metrics

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)

    try:
        # List all custom metrics
        api_instance.api_v1_analytics_custom_metrics_get()
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_custom_metrics_get: %s\n" % e)
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
**200** | Custom metrics list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_custom_metrics_metric_id_get**
> api_v1_analytics_custom_metrics_metric_id_get(metric_id)

Execute a custom metric query

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    metric_id = 'metric_id_example' # str | 

    try:
        # Execute a custom metric query
        api_instance.api_v1_analytics_custom_metrics_metric_id_get(metric_id)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_custom_metrics_metric_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **metric_id** | **str**|  | 

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
**200** | Metric result |  -  |
**404** | Metric not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_historical_metric_get**
> api_v1_analytics_historical_metric_get(metric, symbol=symbol, days=days)

Get historical comparison data

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    metric = 'metric_example' # str | 
    symbol = 'symbol_example' # str |  (optional)
    days = 30 # int |  (optional) (default to 30)

    try:
        # Get historical comparison data
        api_instance.api_v1_analytics_historical_metric_get(metric, symbol=symbol, days=days)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_historical_metric_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **metric** | **str**|  | 
 **symbol** | **str**|  | [optional] 
 **days** | **int**|  | [optional] [default to 30]

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
**200** | Historical data |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_protocol_get**
> api_v1_analytics_protocol_get(force_refresh=force_refresh)

Get protocol-wide statistics

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    force_refresh = 'force_refresh_example' # str |  (optional)

    try:
        # Get protocol-wide statistics
        api_instance.api_v1_analytics_protocol_get(force_refresh=force_refresh)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_protocol_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **force_refresh** | **str**|  | [optional] 

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
**200** | Protocol stats |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_summary_get**
> api_v1_analytics_summary_get()

Get comprehensive analytics summary

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)

    try:
        # Get comprehensive analytics summary
        api_instance.api_v1_analytics_summary_get()
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_summary_get: %s\n" % e)
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
**200** | Analytics summary |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_top_performers_get**
> api_v1_analytics_top_performers_get(type=type, metric=metric, limit=limit)

Get top performing assets or bridges

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    type = assets # str |  (optional) (default to assets)
    metric = health # str |  (optional) (default to health)
    limit = 10 # int |  (optional) (default to 10)

    try:
        # Get top performing assets or bridges
        api_instance.api_v1_analytics_top_performers_get(type=type, metric=metric, limit=limit)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_top_performers_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type** | **str**|  | [optional] [default to assets]
 **metric** | **str**|  | [optional] [default to health]
 **limit** | **int**|  | [optional] [default to 10]

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
**200** | Top performers |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_trends_metric_get**
> api_v1_analytics_trends_metric_get(metric)

Calculate trend for a metric

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    metric = 'metric_example' # str | 

    try:
        # Calculate trend for a metric
        api_instance.api_v1_analytics_trends_metric_get(metric)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_trends_metric_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **metric** | **str**|  | 

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
**200** | Trend data |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_analytics_volume_get**
> api_v1_analytics_volume_get(period=period, symbol=symbol, bridge_name=bridge_name)

Get volume aggregations

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
    api_instance = bridge_watch_client.AnalyticsApi(api_client)
    period = daily # str |  (optional) (default to daily)
    symbol = 'symbol_example' # str |  (optional)
    bridge_name = 'bridge_name_example' # str |  (optional)

    try:
        # Get volume aggregations
        api_instance.api_v1_analytics_volume_get(period=period, symbol=symbol, bridge_name=bridge_name)
    except Exception as e:
        print("Exception when calling AnalyticsApi->api_v1_analytics_volume_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **period** | **str**|  | [optional] [default to daily]
 **symbol** | **str**|  | [optional] 
 **bridge_name** | **str**|  | [optional] 

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
**200** | Volume aggregations |  -  |
**400** | Invalid period |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

