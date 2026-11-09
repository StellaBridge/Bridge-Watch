# HealthScore


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**symbol** | **str** |  | [optional] 
**score** | **float** |  | [optional] 
**status** | **str** |  | [optional] 
**updated_at** | **datetime** |  | [optional] 

## Example

```python
from bridge_watch_client.models.health_score import HealthScore

# TODO update the JSON string below
json = "{}"
# create an instance of HealthScore from a JSON string
health_score_instance = HealthScore.from_json(json)
# print the JSON string representation of the object
print(HealthScore.to_json())

# convert the object into a dict
health_score_dict = health_score_instance.to_dict()
# create an instance of HealthScore from a dict
health_score_from_dict = HealthScore.from_dict(health_score_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


