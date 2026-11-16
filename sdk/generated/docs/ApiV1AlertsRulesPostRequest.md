# ApiV1AlertsRulesPostRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**OwnerAddress** | **string** |  | 
**Name** | **string** |  | 
**AssetCode** | **string** |  | 
**Conditions** | **[]map[string]interface{}** |  | 
**ConditionOp** | Pointer to **string** |  | [optional] [default to "AND"]
**Priority** | Pointer to **string** |  | [optional] [default to "medium"]
**CooldownSeconds** | Pointer to **int32** |  | [optional] [default to 300]
**WebhookUrl** | Pointer to **string** |  | [optional] 

## Methods

### NewApiV1AlertsRulesPostRequest

`func NewApiV1AlertsRulesPostRequest(ownerAddress string, name string, assetCode string, conditions []map[string]interface{}, ) *ApiV1AlertsRulesPostRequest`

NewApiV1AlertsRulesPostRequest instantiates a new ApiV1AlertsRulesPostRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewApiV1AlertsRulesPostRequestWithDefaults

`func NewApiV1AlertsRulesPostRequestWithDefaults() *ApiV1AlertsRulesPostRequest`

NewApiV1AlertsRulesPostRequestWithDefaults instantiates a new ApiV1AlertsRulesPostRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOwnerAddress

`func (o *ApiV1AlertsRulesPostRequest) GetOwnerAddress() string`

GetOwnerAddress returns the OwnerAddress field if non-nil, zero value otherwise.

### GetOwnerAddressOk

`func (o *ApiV1AlertsRulesPostRequest) GetOwnerAddressOk() (*string, bool)`

GetOwnerAddressOk returns a tuple with the OwnerAddress field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOwnerAddress

`func (o *ApiV1AlertsRulesPostRequest) SetOwnerAddress(v string)`

SetOwnerAddress sets OwnerAddress field to given value.


### GetName

`func (o *ApiV1AlertsRulesPostRequest) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *ApiV1AlertsRulesPostRequest) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *ApiV1AlertsRulesPostRequest) SetName(v string)`

SetName sets Name field to given value.


### GetAssetCode

`func (o *ApiV1AlertsRulesPostRequest) GetAssetCode() string`

GetAssetCode returns the AssetCode field if non-nil, zero value otherwise.

### GetAssetCodeOk

`func (o *ApiV1AlertsRulesPostRequest) GetAssetCodeOk() (*string, bool)`

GetAssetCodeOk returns a tuple with the AssetCode field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAssetCode

`func (o *ApiV1AlertsRulesPostRequest) SetAssetCode(v string)`

SetAssetCode sets AssetCode field to given value.


### GetConditions

`func (o *ApiV1AlertsRulesPostRequest) GetConditions() []map[string]interface{}`

GetConditions returns the Conditions field if non-nil, zero value otherwise.

### GetConditionsOk

`func (o *ApiV1AlertsRulesPostRequest) GetConditionsOk() (*[]map[string]interface{}, bool)`

GetConditionsOk returns a tuple with the Conditions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConditions

`func (o *ApiV1AlertsRulesPostRequest) SetConditions(v []map[string]interface{})`

SetConditions sets Conditions field to given value.


### GetConditionOp

`func (o *ApiV1AlertsRulesPostRequest) GetConditionOp() string`

GetConditionOp returns the ConditionOp field if non-nil, zero value otherwise.

### GetConditionOpOk

`func (o *ApiV1AlertsRulesPostRequest) GetConditionOpOk() (*string, bool)`

GetConditionOpOk returns a tuple with the ConditionOp field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConditionOp

`func (o *ApiV1AlertsRulesPostRequest) SetConditionOp(v string)`

SetConditionOp sets ConditionOp field to given value.

### HasConditionOp

`func (o *ApiV1AlertsRulesPostRequest) HasConditionOp() bool`

HasConditionOp returns a boolean if a field has been set.

### GetPriority

`func (o *ApiV1AlertsRulesPostRequest) GetPriority() string`

GetPriority returns the Priority field if non-nil, zero value otherwise.

### GetPriorityOk

`func (o *ApiV1AlertsRulesPostRequest) GetPriorityOk() (*string, bool)`

GetPriorityOk returns a tuple with the Priority field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPriority

`func (o *ApiV1AlertsRulesPostRequest) SetPriority(v string)`

SetPriority sets Priority field to given value.

### HasPriority

`func (o *ApiV1AlertsRulesPostRequest) HasPriority() bool`

HasPriority returns a boolean if a field has been set.

### GetCooldownSeconds

`func (o *ApiV1AlertsRulesPostRequest) GetCooldownSeconds() int32`

GetCooldownSeconds returns the CooldownSeconds field if non-nil, zero value otherwise.

### GetCooldownSecondsOk

`func (o *ApiV1AlertsRulesPostRequest) GetCooldownSecondsOk() (*int32, bool)`

GetCooldownSecondsOk returns a tuple with the CooldownSeconds field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCooldownSeconds

`func (o *ApiV1AlertsRulesPostRequest) SetCooldownSeconds(v int32)`

SetCooldownSeconds sets CooldownSeconds field to given value.

### HasCooldownSeconds

`func (o *ApiV1AlertsRulesPostRequest) HasCooldownSeconds() bool`

HasCooldownSeconds returns a boolean if a field has been set.

### GetWebhookUrl

`func (o *ApiV1AlertsRulesPostRequest) GetWebhookUrl() string`

GetWebhookUrl returns the WebhookUrl field if non-nil, zero value otherwise.

### GetWebhookUrlOk

`func (o *ApiV1AlertsRulesPostRequest) GetWebhookUrlOk() (*string, bool)`

GetWebhookUrlOk returns a tuple with the WebhookUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWebhookUrl

`func (o *ApiV1AlertsRulesPostRequest) SetWebhookUrl(v string)`

SetWebhookUrl sets WebhookUrl field to given value.

### HasWebhookUrl

`func (o *ApiV1AlertsRulesPostRequest) HasWebhookUrl() bool`

HasWebhookUrl returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


