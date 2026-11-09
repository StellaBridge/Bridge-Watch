# ApiV1AlertsRulesPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**owner_address** | **str** |  | 
**name** | **str** |  | 
**asset_code** | **str** |  | 
**conditions** | **List[object]** |  | 
**condition_op** | **str** |  | [optional] [default to 'AND']
**priority** | **str** |  | [optional] [default to 'medium']
**cooldown_seconds** | **int** |  | [optional] [default to 300]
**webhook_url** | **str** |  | [optional] 

## Example

```python
from bridge_watch_client.models.api_v1_alerts_rules_post_request import ApiV1AlertsRulesPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1AlertsRulesPostRequest from a JSON string
api_v1_alerts_rules_post_request_instance = ApiV1AlertsRulesPostRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1AlertsRulesPostRequest.to_json())

# convert the object into a dict
api_v1_alerts_rules_post_request_dict = api_v1_alerts_rules_post_request_instance.to_dict()
# create an instance of ApiV1AlertsRulesPostRequest from a dict
api_v1_alerts_rules_post_request_from_dict = ApiV1AlertsRulesPostRequest.from_dict(api_v1_alerts_rules_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


