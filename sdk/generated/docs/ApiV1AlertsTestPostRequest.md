# ApiV1AlertsTestPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**rule** | **object** |  | 
**metrics** | **object** |  | 

## Example

```python
from bridge_watch_client.models.api_v1_alerts_test_post_request import ApiV1AlertsTestPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1AlertsTestPostRequest from a JSON string
api_v1_alerts_test_post_request_instance = ApiV1AlertsTestPostRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1AlertsTestPostRequest.to_json())

# convert the object into a dict
api_v1_alerts_test_post_request_dict = api_v1_alerts_test_post_request_instance.to_dict()
# create an instance of ApiV1AlertsTestPostRequest from a dict
api_v1_alerts_test_post_request_from_dict = ApiV1AlertsTestPostRequest.from_dict(api_v1_alerts_test_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


