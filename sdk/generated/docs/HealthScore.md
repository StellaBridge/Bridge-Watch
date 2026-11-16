# HealthScore

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Symbol** | Pointer to **string** |  | [optional] 
**Score** | Pointer to **float32** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**UpdatedAt** | Pointer to **time.Time** |  | [optional] 

## Methods

### NewHealthScore

`func NewHealthScore() *HealthScore`

NewHealthScore instantiates a new HealthScore object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthScoreWithDefaults

`func NewHealthScoreWithDefaults() *HealthScore`

NewHealthScoreWithDefaults instantiates a new HealthScore object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetSymbol

`func (o *HealthScore) GetSymbol() string`

GetSymbol returns the Symbol field if non-nil, zero value otherwise.

### GetSymbolOk

`func (o *HealthScore) GetSymbolOk() (*string, bool)`

GetSymbolOk returns a tuple with the Symbol field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSymbol

`func (o *HealthScore) SetSymbol(v string)`

SetSymbol sets Symbol field to given value.

### HasSymbol

`func (o *HealthScore) HasSymbol() bool`

HasSymbol returns a boolean if a field has been set.

### GetScore

`func (o *HealthScore) GetScore() float32`

GetScore returns the Score field if non-nil, zero value otherwise.

### GetScoreOk

`func (o *HealthScore) GetScoreOk() (*float32, bool)`

GetScoreOk returns a tuple with the Score field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetScore

`func (o *HealthScore) SetScore(v float32)`

SetScore sets Score field to given value.

### HasScore

`func (o *HealthScore) HasScore() bool`

HasScore returns a boolean if a field has been set.

### GetStatus

`func (o *HealthScore) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *HealthScore) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *HealthScore) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *HealthScore) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetUpdatedAt

`func (o *HealthScore) GetUpdatedAt() time.Time`

GetUpdatedAt returns the UpdatedAt field if non-nil, zero value otherwise.

### GetUpdatedAtOk

`func (o *HealthScore) GetUpdatedAtOk() (*time.Time, bool)`

GetUpdatedAtOk returns a tuple with the UpdatedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUpdatedAt

`func (o *HealthScore) SetUpdatedAt(v time.Time)`

SetUpdatedAt sets UpdatedAt field to given value.

### HasUpdatedAt

`func (o *HealthScore) HasUpdatedAt() bool`

HasUpdatedAt returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


