# ApiV1CacheInvalidatePostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**tag** | **str** |  | [optional] 
**key** | **str** |  | [optional] 

## Example

```python
from bridge_watch_client.models.api_v1_cache_invalidate_post_request import ApiV1CacheInvalidatePostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1CacheInvalidatePostRequest from a JSON string
api_v1_cache_invalidate_post_request_instance = ApiV1CacheInvalidatePostRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1CacheInvalidatePostRequest.to_json())

# convert the object into a dict
api_v1_cache_invalidate_post_request_dict = api_v1_cache_invalidate_post_request_instance.to_dict()
# create an instance of ApiV1CacheInvalidatePostRequest from a dict
api_v1_cache_invalidate_post_request_from_dict = ApiV1CacheInvalidatePostRequest.from_dict(api_v1_cache_invalidate_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


