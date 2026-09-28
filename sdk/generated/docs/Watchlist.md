# Watchlist


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **str** |  | [optional] 
**user_id** | **str** |  | [optional] 
**name** | **str** |  | [optional] 
**is_default** | **bool** |  | [optional] 
**assets** | **List[str]** |  | [optional] 
**created_at** | **datetime** |  | [optional] 

## Example

```python
from bridge_watch_client.models.watchlist import Watchlist

# TODO update the JSON string below
json = "{}"
# create an instance of Watchlist from a JSON string
watchlist_instance = Watchlist.from_json(json)
# print the JSON string representation of the object
print(Watchlist.to_json())

# convert the object into a dict
watchlist_dict = watchlist_instance.to_dict()
# create an instance of Watchlist from a dict
watchlist_from_dict = Watchlist.from_dict(watchlist_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


