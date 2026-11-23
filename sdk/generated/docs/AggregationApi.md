# bridge_watch_client.AggregationApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_aggregation_stats_get**](AggregationApi.md#api_v1_aggregation_stats_get) | **GET** /api/v1/aggregation/stats | Get aggregation statistics
[**api_v1_aggregation_symbol_health_get**](AggregationApi.md#api_v1_aggregation_symbol_health_get) | **GET** /api/v1/aggregation/{symbol}/health | Aggregate health scores
[**api_v1_aggregation_symbol_prices_get**](AggregationApi.md#api_v1_aggregation_symbol_prices_get) | **GET** /api/v1/aggregation/{symbol}/prices | Aggregate price data
[**api_v1_aggregation_symbol_volume_get**](AggregationApi.md#api_v1_aggregation_symbol_volume_get) | **GET** /api/v1/aggregation/{symbol}/volume | Aggregate volume data


# **api_v1_aggregation_stats_get**
> api_v1_aggregation_stats_get()

Get aggregation statistics

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
    api_instance = bridge_watch_client.AggregationApi(api_client)

    try:
        # Get aggregation statistics
        api_instance.api_v1_aggregation_stats_get()
    except Exception as e:
        print("Exception when calling AggregationApi->api_v1_aggregation_stats_get: %s\n" % e)
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
**200** | Stats |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_aggregation_symbol_health_get**
> api_v1_aggregation_symbol_health_get(symbol, interval, start_time, end_time)

Aggregate health scores

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
    api_instance = bridge_watch_client.AggregationApi(api_client)
    symbol = 'symbol_example' # str | 
    interval = 'interval_example' # str | 
    start_time = '2013-10-20T19:20:30+01:00' # datetime | 
    end_time = '2013-10-20T19:20:30+01:00' # datetime | 

    try:
        # Aggregate health scores
        api_instance.api_v1_aggregation_symbol_health_get(symbol, interval, start_time, end_time)
    except Exception as e:
        print("Exception when calling AggregationApi->api_v1_aggregation_symbol_health_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 
 **interval** | **str**|  | 
 **start_time** | **datetime**|  | 
 **end_time** | **datetime**|  | 

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
**200** | Health aggregations |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_aggregation_symbol_prices_get**
> api_v1_aggregation_symbol_prices_get(symbol, interval, start_time, end_time)

Aggregate price data

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
    api_instance = bridge_watch_client.AggregationApi(api_client)
    symbol = 'symbol_example' # str | 
    interval = 'interval_example' # str | 
    start_time = '2013-10-20T19:20:30+01:00' # datetime | 
    end_time = '2013-10-20T19:20:30+01:00' # datetime | 

    try:
        # Aggregate price data
        api_instance.api_v1_aggregation_symbol_prices_get(symbol, interval, start_time, end_time)
    except Exception as e:
        print("Exception when calling AggregationApi->api_v1_aggregation_symbol_prices_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 
 **interval** | **str**|  | 
 **start_time** | **datetime**|  | 
 **end_time** | **datetime**|  | 

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
**200** | Price aggregations |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_aggregation_symbol_volume_get**
> api_v1_aggregation_symbol_volume_get(symbol, interval, start_time, end_time)

Aggregate volume data

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
    api_instance = bridge_watch_client.AggregationApi(api_client)
    symbol = 'symbol_example' # str | 
    interval = 'interval_example' # str | 
    start_time = '2013-10-20T19:20:30+01:00' # datetime | 
    end_time = '2013-10-20T19:20:30+01:00' # datetime | 

    try:
        # Aggregate volume data
        api_instance.api_v1_aggregation_symbol_volume_get(symbol, interval, start_time, end_time)
    except Exception as e:
        print("Exception when calling AggregationApi->api_v1_aggregation_symbol_volume_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 
 **interval** | **str**|  | 
 **start_time** | **datetime**|  | 
 **end_time** | **datetime**|  | 

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

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

