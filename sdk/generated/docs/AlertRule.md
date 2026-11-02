# AlertRule

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**OwnerAddress** | Pointer to **string** |  | [optional] 
**Name** | Pointer to **string** |  | [optional] 
**AssetCode** | Pointer to **string** |  | [optional] 
**Conditions** | Pointer to **[]map[string]interface{}** |  | [optional] 
**ConditionOp** | Pointer to **string** |  | [optional] 
**Priority** | Pointer to **string** |  | [optional] 
**CooldownSeconds** | Pointer to **int32** |  | [optional] 
**WebhookUrl** | Pointer to **string** |  | [optional] 
**IsActive** | Pointer to **bool** |  | [optional] 
**CreatedAt** | Pointer to **time.Time** |  | [optional] 

## Methods

### NewAlertRule

`func NewAlertRule() *AlertRule`

NewAlertRule instantiates a new AlertRule object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAlertRuleWithDefaults

`func NewAlertRuleWithDefaults() *AlertRule`

NewAlertRuleWithDefaults instantiates a new AlertRule object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *AlertRule) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *AlertRule) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *AlertRule) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *AlertRule) HasId() bool`

HasId returns a boolean if a field has been set.

### GetOwnerAddress

`func (o *AlertRule) GetOwnerAddress() string`

GetOwnerAddress returns the OwnerAddress field if non-nil, zero value otherwise.

### GetOwnerAddressOk

`func (o *AlertRule) GetOwnerAddressOk() (*string, bool)`

GetOwnerAddressOk returns a tuple with the OwnerAddress field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOwnerAddress

`func (o *AlertRule) SetOwnerAddress(v string)`

SetOwnerAddress sets OwnerAddress field to given value.

### HasOwnerAddress

`func (o *AlertRule) HasOwnerAddress() bool`

HasOwnerAddress returns a boolean if a field has been set.

### GetName

`func (o *AlertRule) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *AlertRule) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *AlertRule) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *AlertRule) HasName() bool`

HasName returns a boolean if a field has been set.

### GetAssetCode

`func (o *AlertRule) GetAssetCode() string`

GetAssetCode returns the AssetCode field if non-nil, zero value otherwise.

### GetAssetCodeOk

`func (o *AlertRule) GetAssetCodeOk() (*string, bool)`

GetAssetCodeOk returns a tuple with the AssetCode field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAssetCode

`func (o *AlertRule) SetAssetCode(v string)`

SetAssetCode sets AssetCode field to given value.

### HasAssetCode

`func (o *AlertRule) HasAssetCode() bool`

HasAssetCode returns a boolean if a field has been set.

### GetConditions

`func (o *AlertRule) GetConditions() []map[string]interface{}`

GetConditions returns the Conditions field if non-nil, zero value otherwise.

### GetConditionsOk

`func (o *AlertRule) GetConditionsOk() (*[]map[string]interface{}, bool)`

GetConditionsOk returns a tuple with the Conditions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConditions

`func (o *AlertRule) SetConditions(v []map[string]interface{})`

SetConditions sets Conditions field to given value.

### HasConditions

`func (o *AlertRule) HasConditions() bool`

HasConditions returns a boolean if a field has been set.

### GetConditionOp

`func (o *AlertRule) GetConditionOp() string`

GetConditionOp returns the ConditionOp field if non-nil, zero value otherwise.

### GetConditionOpOk

`func (o *AlertRule) GetConditionOpOk() (*string, bool)`

GetConditionOpOk returns a tuple with the ConditionOp field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConditionOp

`func (o *AlertRule) SetConditionOp(v string)`

SetConditionOp sets ConditionOp field to given value.

### HasConditionOp

`func (o *AlertRule) HasConditionOp() bool`

HasConditionOp returns a boolean if a field has been set.

### GetPriority

`func (o *AlertRule) GetPriority() string`

GetPriority returns the Priority field if non-nil, zero value otherwise.

### GetPriorityOk

`func (o *AlertRule) GetPriorityOk() (*string, bool)`

GetPriorityOk returns a tuple with the Priority field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPriority

`func (o *AlertRule) SetPriority(v string)`

SetPriority sets Priority field to given value.

### HasPriority

`func (o *AlertRule) HasPriority() bool`

HasPriority returns a boolean if a field has been set.

### GetCooldownSeconds

`func (o *AlertRule) GetCooldownSeconds() int32`

GetCooldownSeconds returns the CooldownSeconds field if non-nil, zero value otherwise.

### GetCooldownSecondsOk

`func (o *AlertRule) GetCooldownSecondsOk() (*int32, bool)`

GetCooldownSecondsOk returns a tuple with the CooldownSeconds field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCooldownSeconds

`func (o *AlertRule) SetCooldownSeconds(v int32)`

SetCooldownSeconds sets CooldownSeconds field to given value.

### HasCooldownSeconds

`func (o *AlertRule) HasCooldownSeconds() bool`

HasCooldownSeconds returns a boolean if a field has been set.

### GetWebhookUrl

`func (o *AlertRule) GetWebhookUrl() string`

GetWebhookUrl returns the WebhookUrl field if non-nil, zero value otherwise.

### GetWebhookUrlOk

`func (o *AlertRule) GetWebhookUrlOk() (*string, bool)`

GetWebhookUrlOk returns a tuple with the WebhookUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWebhookUrl

`func (o *AlertRule) SetWebhookUrl(v string)`

SetWebhookUrl sets WebhookUrl field to given value.

### HasWebhookUrl

`func (o *AlertRule) HasWebhookUrl() bool`

HasWebhookUrl returns a boolean if a field has been set.

### GetIsActive

`func (o *AlertRule) GetIsActive() bool`

GetIsActive returns the IsActive field if non-nil, zero value otherwise.

### GetIsActiveOk

`func (o *AlertRule) GetIsActiveOk() (*bool, bool)`

GetIsActiveOk returns a tuple with the IsActive field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIsActive

`func (o *AlertRule) SetIsActive(v bool)`

SetIsActive sets IsActive field to given value.

### HasIsActive

`func (o *AlertRule) HasIsActive() bool`

HasIsActive returns a boolean if a field has been set.

### GetCreatedAt

`func (o *AlertRule) GetCreatedAt() time.Time`

GetCreatedAt returns the CreatedAt field if non-nil, zero value otherwise.

### GetCreatedAtOk

`func (o *AlertRule) GetCreatedAtOk() (*time.Time, bool)`

GetCreatedAtOk returns a tuple with the CreatedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedAt

`func (o *AlertRule) SetCreatedAt(v time.Time)`

SetCreatedAt sets CreatedAt field to given value.

### HasCreatedAt

`func (o *AlertRule) HasCreatedAt() bool`

HasCreatedAt returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


