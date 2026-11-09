# ApiV1ConfigKeyDeleteRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**deleted_by** | **str** |  | 

## Example

```python
from bridge_watch_client.models.api_v1_config_key_delete_request import ApiV1ConfigKeyDeleteRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1ConfigKeyDeleteRequest from a JSON string
api_v1_config_key_delete_request_instance = ApiV1ConfigKeyDeleteRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1ConfigKeyDeleteRequest.to_json())

# convert the object into a dict
api_v1_config_key_delete_request_dict = api_v1_config_key_delete_request_instance.to_dict()
# create an instance of ApiV1ConfigKeyDeleteRequest from a dict
api_v1_config_key_delete_request_from_dict = ApiV1ConfigKeyDeleteRequest.from_dict(api_v1_config_key_delete_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


