# ApiV1WatchlistsUserIdPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**name** | **str** |  | 
**is_default** | **bool** |  | [optional] 

## Example

```python
from bridge_watch_client.models.api_v1_watchlists_user_id_post_request import ApiV1WatchlistsUserIdPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1WatchlistsUserIdPostRequest from a JSON string
api_v1_watchlists_user_id_post_request_instance = ApiV1WatchlistsUserIdPostRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1WatchlistsUserIdPostRequest.to_json())

# convert the object into a dict
api_v1_watchlists_user_id_post_request_dict = api_v1_watchlists_user_id_post_request_instance.to_dict()
# create an instance of ApiV1WatchlistsUserIdPostRequest from a dict
api_v1_watchlists_user_id_post_request_from_dict = ApiV1WatchlistsUserIdPostRequest.from_dict(api_v1_watchlists_user_id_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


