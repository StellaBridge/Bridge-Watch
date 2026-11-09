# bridge_watch_client.MetadataApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_metadata_asset_id_delete**](MetadataApi.md#api_v1_metadata_asset_id_delete) | **DELETE** /api/v1/metadata/{assetId} | Delete asset metadata
[**api_v1_metadata_asset_id_get**](MetadataApi.md#api_v1_metadata_asset_id_get) | **GET** /api/v1/metadata/{assetId} | Get metadata by asset ID
[**api_v1_metadata_asset_id_history_get**](MetadataApi.md#api_v1_metadata_asset_id_history_get) | **GET** /api/v1/metadata/{assetId}/history | Get metadata version history
[**api_v1_metadata_asset_id_logo_patch**](MetadataApi.md#api_v1_metadata_asset_id_logo_patch) | **PATCH** /api/v1/metadata/{assetId}/logo | Update asset logo
[**api_v1_metadata_category_category_get**](MetadataApi.md#api_v1_metadata_category_category_get) | **GET** /api/v1/metadata/category/{category} | Get metadata by category
[**api_v1_metadata_get**](MetadataApi.md#api_v1_metadata_get) | **GET** /api/v1/metadata | List all asset metadata
[**api_v1_metadata_post**](MetadataApi.md#api_v1_metadata_post) | **POST** /api/v1/metadata | Create or update asset metadata
[**api_v1_metadata_search_get**](MetadataApi.md#api_v1_metadata_search_get) | **GET** /api/v1/metadata/search | Search asset metadata
[**api_v1_metadata_symbol_symbol_get**](MetadataApi.md#api_v1_metadata_symbol_symbol_get) | **GET** /api/v1/metadata/symbol/{symbol} | Get metadata by symbol


# **api_v1_metadata_asset_id_delete**
> api_v1_metadata_asset_id_delete(asset_id)

Delete asset metadata

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    asset_id = 'asset_id_example' # str | 

    try:
        # Delete asset metadata
        api_instance.api_v1_metadata_asset_id_delete(asset_id)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_asset_id_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **asset_id** | **str**|  | 

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
**200** | Deleted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_asset_id_get**
> api_v1_metadata_asset_id_get(asset_id)

Get metadata by asset ID

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    asset_id = 'asset_id_example' # str | 

    try:
        # Get metadata by asset ID
        api_instance.api_v1_metadata_asset_id_get(asset_id)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_asset_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **asset_id** | **str**|  | 

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
**200** | Metadata |  -  |
**404** | Not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_asset_id_history_get**
> api_v1_metadata_asset_id_history_get(asset_id)

Get metadata version history

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    asset_id = 'asset_id_example' # str | 

    try:
        # Get metadata version history
        api_instance.api_v1_metadata_asset_id_history_get(asset_id)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_asset_id_history_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **asset_id** | **str**|  | 

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
**200** | Version history |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_asset_id_logo_patch**
> api_v1_metadata_asset_id_logo_patch(asset_id, api_v1_metadata_asset_id_logo_patch_request)

Update asset logo

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_metadata_asset_id_logo_patch_request import ApiV1MetadataAssetIdLogoPatchRequest
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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    asset_id = 'asset_id_example' # str | 
    api_v1_metadata_asset_id_logo_patch_request = bridge_watch_client.ApiV1MetadataAssetIdLogoPatchRequest() # ApiV1MetadataAssetIdLogoPatchRequest | 

    try:
        # Update asset logo
        api_instance.api_v1_metadata_asset_id_logo_patch(asset_id, api_v1_metadata_asset_id_logo_patch_request)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_asset_id_logo_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **asset_id** | **str**|  | 
 **api_v1_metadata_asset_id_logo_patch_request** | [**ApiV1MetadataAssetIdLogoPatchRequest**](ApiV1MetadataAssetIdLogoPatchRequest.md)|  | 

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
**200** | Logo updated |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_category_category_get**
> api_v1_metadata_category_category_get(category)

Get metadata by category

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    category = 'category_example' # str | 

    try:
        # Get metadata by category
        api_instance.api_v1_metadata_category_category_get(category)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_category_category_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **category** | **str**|  | 

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
**200** | Metadata |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_get**
> api_v1_metadata_get()

List all asset metadata

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
    api_instance = bridge_watch_client.MetadataApi(api_client)

    try:
        # List all asset metadata
        api_instance.api_v1_metadata_get()
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_get: %s\n" % e)
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
**200** | Metadata list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_post**
> api_v1_metadata_post(body)

Create or update asset metadata

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    body = None # object | 

    try:
        # Create or update asset metadata
        api_instance.api_v1_metadata_post(body)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **body** | **object**|  | 

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
**201** | Created/updated |  -  |
**400** | Validation error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_search_get**
> api_v1_metadata_search_get(q)

Search asset metadata

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    q = 'q_example' # str | 

    try:
        # Search asset metadata
        api_instance.api_v1_metadata_search_get(q)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_search_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **q** | **str**|  | 

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
**200** | Search results |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_metadata_symbol_symbol_get**
> api_v1_metadata_symbol_symbol_get(symbol)

Get metadata by symbol

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
    api_instance = bridge_watch_client.MetadataApi(api_client)
    symbol = 'symbol_example' # str | 

    try:
        # Get metadata by symbol
        api_instance.api_v1_metadata_symbol_symbol_get(symbol)
    except Exception as e:
        print("Exception when calling MetadataApi->api_v1_metadata_symbol_symbol_get: %s\n" % e)
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
**200** | Metadata |  -  |
**404** | Not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

