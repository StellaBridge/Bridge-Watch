# bridge_watch_client.BridgesApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_bridges_bridge_stats_get**](BridgesApi.md#api_v1_bridges_bridge_stats_get) | **GET** /api/v1/bridges/{bridge}/stats | Get bridge statistics
[**api_v1_bridges_get**](BridgesApi.md#api_v1_bridges_get) | **GET** /api/v1/bridges | List all bridge statuses


# **api_v1_bridges_bridge_stats_get**
> api_v1_bridges_bridge_stats_get(bridge)

Get bridge statistics

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
    api_instance = bridge_watch_client.BridgesApi(api_client)
    bridge = 'allbridge' # str | 

    try:
        # Get bridge statistics
        api_instance.api_v1_bridges_bridge_stats_get(bridge)
    except Exception as e:
        print("Exception when calling BridgesApi->api_v1_bridges_bridge_stats_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **bridge** | **str**|  | 

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
**200** | Bridge statistics |  -  |
**404** | Bridge not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_bridges_get**
> api_v1_bridges_get()

List all bridge statuses

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
    api_instance = bridge_watch_client.BridgesApi(api_client)

    try:
        # List all bridge statuses
        api_instance.api_v1_bridges_get()
    except Exception as e:
        print("Exception when calling BridgesApi->api_v1_bridges_get: %s\n" % e)
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
**200** | Bridge status list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

