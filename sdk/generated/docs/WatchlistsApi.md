# bridge_watch_client.WatchlistsApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_watchlists_user_id_get**](WatchlistsApi.md#api_v1_watchlists_user_id_get) | **GET** /api/v1/watchlists/{userId} | Get all watchlists for a user
[**api_v1_watchlists_user_id_id_delete**](WatchlistsApi.md#api_v1_watchlists_user_id_id_delete) | **DELETE** /api/v1/watchlists/{userId}/{id} | Delete a watchlist
[**api_v1_watchlists_user_id_id_patch**](WatchlistsApi.md#api_v1_watchlists_user_id_id_patch) | **PATCH** /api/v1/watchlists/{userId}/{id} | Update a watchlist
[**api_v1_watchlists_user_id_post**](WatchlistsApi.md#api_v1_watchlists_user_id_post) | **POST** /api/v1/watchlists/{userId} | Create a watchlist


# **api_v1_watchlists_user_id_get**
> api_v1_watchlists_user_id_get(user_id)

Get all watchlists for a user

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
    api_instance = bridge_watch_client.WatchlistsApi(api_client)
    user_id = 'user_id_example' # str | 

    try:
        # Get all watchlists for a user
        api_instance.api_v1_watchlists_user_id_get(user_id)
    except Exception as e:
        print("Exception when calling WatchlistsApi->api_v1_watchlists_user_id_get: %s\n" % e)
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
**200** | Watchlists |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_watchlists_user_id_id_delete**
> api_v1_watchlists_user_id_id_delete(user_id, id)

Delete a watchlist

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
    api_instance = bridge_watch_client.WatchlistsApi(api_client)
    user_id = 'user_id_example' # str | 
    id = 'id_example' # str | 

    try:
        # Delete a watchlist
        api_instance.api_v1_watchlists_user_id_id_delete(user_id, id)
    except Exception as e:
        print("Exception when calling WatchlistsApi->api_v1_watchlists_user_id_id_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **id** | **str**|  | 

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

# **api_v1_watchlists_user_id_id_patch**
> api_v1_watchlists_user_id_id_patch(user_id, id, body)

Update a watchlist

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
    api_instance = bridge_watch_client.WatchlistsApi(api_client)
    user_id = 'user_id_example' # str | 
    id = 'id_example' # str | 
    body = None # object | 

    try:
        # Update a watchlist
        api_instance.api_v1_watchlists_user_id_id_patch(user_id, id, body)
    except Exception as e:
        print("Exception when calling WatchlistsApi->api_v1_watchlists_user_id_id_patch: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **id** | **str**|  | 
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
**200** | Updated |  -  |
**400** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_watchlists_user_id_post**
> api_v1_watchlists_user_id_post(user_id, api_v1_watchlists_user_id_post_request)

Create a watchlist

### Example


```python
import bridge_watch_client
from bridge_watch_client.models.api_v1_watchlists_user_id_post_request import ApiV1WatchlistsUserIdPostRequest
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
    api_instance = bridge_watch_client.WatchlistsApi(api_client)
    user_id = 'user_id_example' # str | 
    api_v1_watchlists_user_id_post_request = bridge_watch_client.ApiV1WatchlistsUserIdPostRequest() # ApiV1WatchlistsUserIdPostRequest | 

    try:
        # Create a watchlist
        api_instance.api_v1_watchlists_user_id_post(user_id, api_v1_watchlists_user_id_post_request)
    except Exception as e:
        print("Exception when calling WatchlistsApi->api_v1_watchlists_user_id_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **user_id** | **str**|  | 
 **api_v1_watchlists_user_id_post_request** | [**ApiV1WatchlistsUserIdPostRequest**](ApiV1WatchlistsUserIdPostRequest.md)|  | 

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
**200** | Created watchlist |  -  |
**400** | Validation error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

