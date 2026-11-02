# bridge_watch_client.ConfigApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_config_audit_get**](ConfigApi.md#api_v1_config_audit_get) | **GET** /api/v1/config/audit | Get configuration audit trail
[**api_v1_config_cache_clear_post**](ConfigApi.md#api_v1_config_cache_clear_post) | **POST** /api/v1/config/cache/clear | Clear configuration cache
[**api_v1_config_export_get**](ConfigApi.md#api_v1_config_export_get) | **GET** /api/v1/config/export | Export configuration
[**api_v1_config_features_name_get**](ConfigApi.md#api_v1_config_features_name_get) | **GET** /api/v1/config/features/{name} | Check a feature flag
[**api_v1_config_features_post**](ConfigApi.md#api_v1_config_features_post) | **POST** /api/v1/config/features | Set a feature flag
[**api_v1_config_get**](ConfigApi.md#api_v1_config_get) | **GET** /api/v1/config | List all configuration entries
[**api_v1_config_import_post**](ConfigApi.md#api_v1_config_import_post) | **POST** /api/v1/config/import | Import configuration
[**api_v1_config_key_delete**](ConfigApi.md#api_v1_config_key_delete) | **DELETE** /api/v1/config/{key} | Delete a configuration entry
[**api_v1_config_key_get**](ConfigApi.md#api_v1_config_key_get) | **GET** /api/v1/config/{key} | Get a configuration value
[**api_v1_config_post**](ConfigApi.md#api_v1_config_post) | **POST** /api/v1/config | Set a configuration value


# **api_v1_config_audit_get**
> api_v1_config_audit_get()

Get configuration audit trail

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
    api_instance = bridge_watch_client.ConfigApi(api_client)

    try:
        # Get configuration audit trail
        api_instance.api_v1_config_audit_get()
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_audit_get: %s\n" % e)
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
**200** | Audit trail |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_cache_clear_post**
> api_v1_config_cache_clear_post()

Clear configuration cache

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
    api_instance = bridge_watch_client.ConfigApi(api_client)

    try:
        # Clear configuration cache
        api_instance.api_v1_config_cache_clear_post()
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_cache_clear_post: %s\n" % e)
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
**200** | Cache cleared |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_export_get**
> api_v1_config_export_get()

Export configuration

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
    api_instance = bridge_watch_client.ConfigApi(api_client)

    try:
        # Export configuration
        api_instance.api_v1_config_export_get()
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_export_get: %s\n" % e)
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
**200** | Config export |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_features_name_get**
> api_v1_config_features_name_get(name)

Check a feature flag

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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    name = 'name_example' # str | 

    try:
        # Check a feature flag
        api_instance.api_v1_config_features_name_get(name)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_features_name_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **name** | **str**|  | 

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
**200** | Feature flag status |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_features_post**
> api_v1_config_features_post(body)

Set a feature flag

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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    body = None # object | 

    try:
        # Set a feature flag
        api_instance.api_v1_config_features_post(body)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_features_post: %s\n" % e)
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
**201** | Feature flag set |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_get**
> api_v1_config_get()

List all configuration entries

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
    api_instance = bridge_watch_client.ConfigApi(api_client)

    try:
        # List all configuration entries
        api_instance.api_v1_config_get()
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_get: %s\n" % e)
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
**200** | Config list |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_import_post**
> api_v1_config_import_post(body)

Import configuration

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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    body = None # object | 

    try:
        # Import configuration
        api_instance.api_v1_config_import_post(body)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_import_post: %s\n" % e)
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
**201** | Imported |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_key_delete**
> api_v1_config_key_delete(key, api_v1_config_key_delete_request)

Delete a configuration entry

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_config_key_delete_request import ApiV1ConfigKeyDeleteRequest
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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    key = 'key_example' # str | 
    api_v1_config_key_delete_request = bridge_watch_client.ApiV1ConfigKeyDeleteRequest() # ApiV1ConfigKeyDeleteRequest | 

    try:
        # Delete a configuration entry
        api_instance.api_v1_config_key_delete(key, api_v1_config_key_delete_request)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_key_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **key** | **str**|  | 
 **api_v1_config_key_delete_request** | [**ApiV1ConfigKeyDeleteRequest**](ApiV1ConfigKeyDeleteRequest.md)|  | 

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
**200** | Deleted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_key_get**
> api_v1_config_key_get(key)

Get a configuration value

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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    key = 'key_example' # str | 

    try:
        # Get a configuration value
        api_instance.api_v1_config_key_get(key)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_key_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
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
**200** | Config value |  -  |
**404** | Not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_config_post**
> api_v1_config_post(body)

Set a configuration value

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
    api_instance = bridge_watch_client.ConfigApi(api_client)
    body = None # object | 

    try:
        # Set a configuration value
        api_instance.api_v1_config_post(body)
    except Exception as e:
        print("Exception when calling ConfigApi->api_v1_config_post: %s\n" % e)
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
**201** | Config set |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

