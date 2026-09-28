# ApiV1AssetsGet200Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**assets** | **List[object]** |  | [optional] 
**total** | **int** |  | [optional] 

## Example

```python
from bridge_watch_client.models.api_v1_assets_get200_response import ApiV1AssetsGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1AssetsGet200Response from a JSON string
api_v1_assets_get200_response_instance = ApiV1AssetsGet200Response.from_json(json)
# print the JSON string representation of the object
print(ApiV1AssetsGet200Response.to_json())

# convert the object into a dict
api_v1_assets_get200_response_dict = api_v1_assets_get200_response_instance.to_dict()
# create an instance of ApiV1AssetsGet200Response from a dict
api_v1_assets_get200_response_from_dict = ApiV1AssetsGet200Response.from_dict(api_v1_assets_get200_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


