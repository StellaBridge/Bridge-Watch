# bridge_watch_client.JobsApi

All URIs are relative to *http://localhost:3000*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_v1_jobs_job_name_trigger_post**](JobsApi.md#api_v1_jobs_job_name_trigger_post) | **POST** /api/v1/jobs/{jobName}/trigger | Manually trigger a job
[**api_v1_jobs_monitor_get**](JobsApi.md#api_v1_jobs_monitor_get) | **GET** /api/v1/jobs/monitor | Get job queue status


# **api_v1_jobs_job_name_trigger_post**
> api_v1_jobs_job_name_trigger_post(job_name)

Manually trigger a job

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
    api_instance = bridge_watch_client.JobsApi(api_client)
    job_name = 'bridge-health-check' # str | 

    try:
        # Manually trigger a job
        api_instance.api_v1_jobs_job_name_trigger_post(job_name)
    except Exception as e:
        print("Exception when calling JobsApi->api_v1_jobs_job_name_trigger_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **job_name** | **str**|  | 

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
**200** | Job queued |  -  |
**500** | Failed to queue |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **api_v1_jobs_monitor_get**
> api_v1_jobs_monitor_get()

Get job queue status

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
    api_instance = bridge_watch_client.JobsApi(api_client)

    try:
        # Get job queue status
        api_instance.api_v1_jobs_monitor_get()
    except Exception as e:
        print("Exception when calling JobsApi->api_v1_jobs_monitor_get: %s\n" % e)
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
**200** | Queue status and failed jobs |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

