# bridge_watch_client.AssetsApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_assets_get**](AssetsApi.md#api_v1_assets_get) | **GET** /api/v1/assets | List all monitored assets
[**api_v1_assets_symbol_get**](AssetsApi.md#api_v1_assets_symbol_get) | **GET** /api/v1/assets/{symbol} | Get asset details
[**api_v1_assets_symbol_health_get**](AssetsApi.md#api_v1_assets_symbol_health_get) | **GET** /api/v1/assets/{symbol}/health | Get current health score
[**api_v1_assets_symbol_health_history_get**](AssetsApi.md#api_v1_assets_symbol_health_history_get) | **GET** /api/v1/assets/{symbol}/health/history | Get health score history
[**api_v1_assets_symbol_liquidity_get**](AssetsApi.md#api_v1_assets_symbol_liquidity_get) | **GET** /api/v1/assets/{symbol}/liquidity | Get aggregated liquidity data
[**api_v1_assets_symbol_price_get**](AssetsApi.md#api_v1_assets_symbol_price_get) | **GET** /api/v1/assets/{symbol}/price | Get aggregated price from all sources


# **api_v1_assets_get**
> ApiV1AssetsGet200Response api_v1_assets_get()

List all monitored assets

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_assets_get200_response import ApiV1AssetsGet200Response
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
    api_instance = bridge_watch_client.AssetsApi(api_client)

    try:
        # List all monitored assets
        api_response = api_instance.api_v1_assets_get()
        print("The response of AssetsApi->api_v1_assets_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_get: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

### Return type

[**ApiV1AssetsGet200Response**](ApiV1AssetsGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | List of assets |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_assets_symbol_get**
> api_v1_assets_symbol_get(symbol)

Get asset details

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
    api_instance = bridge_watch_client.AssetsApi(api_client)
    symbol = 'USDC' # str | 

    try:
        # Get asset details
        api_instance.api_v1_assets_symbol_get(symbol)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_symbol_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Asset details |  -  |
**404** | Asset not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_assets_symbol_health_get**
> HealthScore api_v1_assets_symbol_health_get(symbol)

Get current health score

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.health_score import HealthScore
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
    api_instance = bridge_watch_client.AssetsApi(api_client)
    symbol = 'USDC' # str | 

    try:
        # Get current health score
        api_response = api_instance.api_v1_assets_symbol_health_get(symbol)
        print("The response of AssetsApi->api_v1_assets_symbol_health_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_symbol_health_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 

### Return type

[**HealthScore**](HealthScore.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Health score |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_assets_symbol_health_history_get**
> api_v1_assets_symbol_health_history_get(symbol, period=period)

Get health score history

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
    api_instance = bridge_watch_client.AssetsApi(api_client)
    symbol = 'symbol_example' # str | 
    period = 7d # str |  (optional) (default to 7d)

    try:
        # Get health score history
        api_instance.api_v1_assets_symbol_health_history_get(symbol, period=period)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_symbol_health_history_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 
 **period** | **str**|  | [optional] [default to 7d]

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
**200** | Health score history |  -  |
**400** | Bad request |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_assets_symbol_liquidity_get**
> api_v1_assets_symbol_liquidity_get(symbol)

Get aggregated liquidity data

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
    api_instance = bridge_watch_client.AssetsApi(api_client)
    symbol = 'symbol_example' # str | 

    try:
        # Get aggregated liquidity data
        api_instance.api_v1_assets_symbol_liquidity_get(symbol)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_symbol_liquidity_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 

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
**200** | Liquidity data |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_assets_symbol_price_get**
> api_v1_assets_symbol_price_get(symbol)

Get aggregated price from all sources

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
    api_instance = bridge_watch_client.AssetsApi(api_client)
    symbol = 'symbol_example' # str | 

    try:
        # Get aggregated price from all sources
        api_instance.api_v1_assets_symbol_price_get(symbol)
    except Exception as e:
        print("Exception when calling AssetsApi->api_v1_assets_symbol_price_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **symbol** | **str**|  | 

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
**200** | Aggregated price |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

