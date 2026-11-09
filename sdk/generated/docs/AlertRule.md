# AlertRule


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **str** |  | [optional] 
**owner_address** | **str** |  | [optional] 
**name** | **str** |  | [optional] 
**asset_code** | **str** |  | [optional] 
**conditions** | **List[object]** |  | [optional] 
**condition_op** | **str** |  | [optional] 
**priority** | **str** |  | [optional] 
**cooldown_seconds** | **int** |  | [optional] 
**webhook_url** | **str** |  | [optional] 
**is_active** | **bool** |  | [optional] 
**created_at** | **datetime** |  | [optional] 

## Example

```python
from bridge_watch_client.models.alert_rule import AlertRule

# TODO update the JSON string below
json = "{}"
# create an instance of AlertRule from a JSON string
alert_rule_instance = AlertRule.from_json(json)
# print the JSON string representation of the object
print(AlertRule.to_json())

# convert the object into a dict
alert_rule_dict = alert_rule_instance.to_dict()
# create an instance of AlertRule from a dict
alert_rule_from_dict = AlertRule.from_dict(alert_rule_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


