# bridge_watch_client.PreferencesApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_preferences_user_id_bulk_patch**](PreferencesApi.md#api_v1_preferences_user_id_bulk_patch) | **PATCH** /api/v1/preferences/{userId}/bulk | Bulk update preferences
[**api_v1_preferences_user_id_category_key_delete**](PreferencesApi.md#api_v1_preferences_user_id_category_key_delete) | **DELETE** /api/v1/preferences/{userId}/{category}/{key} | Reset (delete) a preference key
[**api_v1_preferences_user_id_category_key_get**](PreferencesApi.md#api_v1_preferences_user_id_category_key_get) | **GET** /api/v1/preferences/{userId}/{category}/{key} | Get a single preference value
[**api_v1_preferences_user_id_category_key_put**](PreferencesApi.md#api_v1_preferences_user_id_category_key_put) | **PUT** /api/v1/preferences/{userId}/{category}/{key} | Set a preference value
[**api_v1_preferences_user_id_export_get**](PreferencesApi.md#api_v1_preferences_user_id_export_get) | **GET** /api/v1/preferences/{userId}/export | Export user preferences
[**api_v1_preferences_user_id_get**](PreferencesApi.md#api_v1_preferences_user_id_get) | **GET** /api/v1/preferences/{userId} | Get all preferences for a user
[**api_v1_preferences_user_id_import_post**](PreferencesApi.md#api_v1_preferences_user_id_import_post) | **POST** /api/v1/preferences/{userId}/import | Import user preferences
[**api_v1_preferences_user_id_stream_get**](PreferencesApi.md#api_v1_preferences_user_id_stream_get) | **GET** /api/v1/preferences/{userId}/stream | Stream preference change events (SSE)


# **api_v1_preferences_user_id_bulk_patch**
> api_v1_preferences_user_id_bulk_patch(user_id, body)

Bulk update preferences

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 
    body = None # object | 

    try:
        # Bulk update preferences
        api_instance.api_v1_preferences_user_id_bulk_patch(user_id, body)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_bulk_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
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
**200** | Updated preferences |  -  |
**409** | Version conflict |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_category_key_delete**
> api_v1_preferences_user_id_category_key_delete(user_id, category, key)

Reset (delete) a preference key

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 
    category = 'category_example' # str | 
    key = 'key_example' # str | 

    try:
        # Reset (delete) a preference key
        api_instance.api_v1_preferences_user_id_category_key_delete(user_id, category, key)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_category_key_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **category** | **str**|  | 
 **key** | **str**|  | 

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
**200** | Reset preferences |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_category_key_get**
> api_v1_preferences_user_id_category_key_get(user_id, category, key)

Get a single preference value

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 
    category = 'category_example' # str | 
    key = 'key_example' # str | 

    try:
        # Get a single preference value
        api_instance.api_v1_preferences_user_id_category_key_get(user_id, category, key)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_category_key_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **category** | **str**|  | 
 **key** | **str**|  | 

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
**200** | Preference value |  -  |
**400** | Invalid category |  -  |
**404** | Key not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_category_key_put**
> api_v1_preferences_user_id_category_key_put(user_id, category, key, api_v1_preferences_user_id_category_key_put_request)

Set a preference value

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_preferences_user_id_category_key_put_request import ApiV1PreferencesUserIdCategoryKeyPutRequest
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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 
    category = 'category_example' # str | 
    key = 'key_example' # str | 
    api_v1_preferences_user_id_category_key_put_request = bridge_watch_client.ApiV1PreferencesUserIdCategoryKeyPutRequest() # ApiV1PreferencesUserIdCategoryKeyPutRequest | 

    try:
        # Set a preference value
        api_instance.api_v1_preferences_user_id_category_key_put(user_id, category, key, api_v1_preferences_user_id_category_key_put_request)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_category_key_put: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **category** | **str**|  | 
 **key** | **str**|  | 
 **api_v1_preferences_user_id_category_key_put_request** | [**ApiV1PreferencesUserIdCategoryKeyPutRequest**](ApiV1PreferencesUserIdCategoryKeyPutRequest.md)|  | 

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
**200** | Updated preferences |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_export_get**
> api_v1_preferences_user_id_export_get(user_id)

Export user preferences

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 

    try:
        # Export user preferences
        api_instance.api_v1_preferences_user_id_export_get(user_id)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_export_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 

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
**200** | Exported preferences |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_get**
> api_v1_preferences_user_id_get(user_id)

Get all preferences for a user

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 

    try:
        # Get all preferences for a user
        api_instance.api_v1_preferences_user_id_get(user_id)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 

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
**200** | Preferences |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_import_post**
> api_v1_preferences_user_id_import_post(user_id, body)

Import user preferences

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 
    body = None # object | 

    try:
        # Import user preferences
        api_instance.api_v1_preferences_user_id_import_post(user_id, body)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_import_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
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
**200** | Imported preferences |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_preferences_user_id_stream_get**
> api_v1_preferences_user_id_stream_get(user_id)

Stream preference change events (SSE)

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
    api_instance = bridge_watch_client.PreferencesApi(api_client)
    user_id = 'user_id_example' # str | 

    try:
        # Stream preference change events (SSE)
        api_instance.api_v1_preferences_user_id_stream_get(user_id)
    except Exception as e:
        print("Exception when calling PreferencesApi->api_v1_preferences_user_id_stream_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 

### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/event-stream

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | SSE stream |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

