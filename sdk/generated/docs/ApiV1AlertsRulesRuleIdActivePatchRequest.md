# ApiV1AlertsRulesRuleIdActivePatchRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**owner_address** | **str** |  | 
**is_active** | **bool** |  | 

## Example

```python
from bridge_watch_client.models.api_v1_alerts_rules_rule_id_active_patch_request import ApiV1AlertsRulesRuleIdActivePatchRequest

# TODO update the JSON string below
json = "{}"
# create an instance of ApiV1AlertsRulesRuleIdActivePatchRequest from a JSON string
api_v1_alerts_rules_rule_id_active_patch_request_instance = ApiV1AlertsRulesRuleIdActivePatchRequest.from_json(json)
# print the JSON string representation of the object
print(ApiV1AlertsRulesRuleIdActivePatchRequest.to_json())

# convert the object into a dict
api_v1_alerts_rules_rule_id_active_patch_request_dict = api_v1_alerts_rules_rule_id_active_patch_request_instance.to_dict()
# create an instance of ApiV1AlertsRulesRuleIdActivePatchRequest from a dict
api_v1_alerts_rules_rule_id_active_patch_request_from_dict = ApiV1AlertsRulesRuleIdActivePatchRequest.from_dict(api_v1_alerts_rules_rule_id_active_patch_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


