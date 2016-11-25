///////////////////////////////////////////////////////////////////////////////////////////////////////
// (https://api.playfab.com/Documentation/Server)
// (https://api.playfab.com/Documentation/Client/method/ExecuteCloudScript)
// (https://api.playfab.com/playstream/docs)
///////////////////////////////////////////////////////////////////////////////////////////////////////

var UD_KEY_USED_COUPON = "UsedCoupon";
var TD_KEY_COUPONLIST = "CouponList";

// 커런시의 남은 양 채크와 결과값을 동시에 처리하는 함수
handlers.checkAndSubtractVirtualCurrency = function (args)
{
	var invenResult = server.GetUserInventory({PlayFabId: args.playfabId});
  	var numVirtualCurrency = invenResult.VirtualCurrency[args.code];
  	var vcRechargeTime = invenResult.VirtualCurrencyRechargeTimes[args.code];
  	//log.info(invenResult.VirtualCurrencyRechargeTimes);
  	//log.info( vcRechargeTime);
  	var secondsToRecharge = 0;
  	// 리차지 타임이 0 이면 vcRechargeTime 이 null로 넘어오는듯
  	if (null != vcRechargeTime)
      	secondsToRecharge = vcRechargeTime.SecondsToRecharge;
 	if (numVirtualCurrency - args.amount < 0)
      	return {check: false, numModified: 0, rechargeTime: secondsToRecharge};
  
  	var subCurrencyResult = server.SubtractUserVirtualCurrency({ PlayFabId: args.playfabId, VirtualCurrency: args.code, Amount: args.amount });
  	return  {check: true, numModified: subCurrencyResult.Balance, rechargeTime: secondsToRecharge};
}

// 커런시끼리 교환(구입개념)
handlers.tradeVirtualCurrency = function (args)
{
  	var invenResult = server.GetUserInventory({PlayFabId: args.playfabId});
  	var numVirtualCurrencyFrom = invenResult.VirtualCurrency[args.codeFrom];
 	if (numVirtualCurrencyFrom - args.amountFrom < 0)
      	return {check: false, numModifiedFrom: numVirtualCurrencyFrom, numModifiedTo: 0};
  
  	var subCurrencyResult = server.SubtractUserVirtualCurrency({ PlayFabId: args.playfabId, VirtualCurrency: args.codeFrom, Amount: args.amountFrom });
  	var addCurrencyResult = server.AddUserVirtualCurrency({ PlayFabId: args.playfabId, VirtualCurrency: args.codeTo, Amount: args.amountTo });
  
  	return  {check: true, numModifiedFrom: subCurrencyResult.Balance, numModifiedTo: addCurrencyResult.Balance};
}

// 쿠폰 사용 -> 카달로그에서 해당 아이템 검색 -> 커런시에 추가 
function redeemCouponProcess(couponCode, playfabId)
{
    // 쿠폰이 사용되면 리턴값으로 코드라도 주는게 아니라 걍 익셉션 남 -_- 클라쪽에선 코드를 찾을수 있으니 해당 에러처리는 클라에서 함
    var result = server.RedeemCoupon({CouponCode: couponCode, PlayFabId: playfabId});

    // 쿠폰의 아이템을 카달로그에서 검색. 
    for (var i = 0; i < result.GrantedItems.length; ++i)
    {
        var itemInstance = result.GrantedItems[i];
        var catalog = server.GetCatalogItems({CatalogVersion: itemInstance.CatalogVersion});
        if (null == catalog)
          	continue;

        var foundItem = findItemInCatalogItems(catalog.Catalog, itemInstance.ItemId);

        // 해당 아이템의 price 란을 보상으로 준다.
        if (null != foundItem && null != foundItem.VirtualCurrencyPrices)
        {
            for (var vcCode in foundItem.VirtualCurrencyPrices)
            {
              var amount = foundItem.VirtualCurrencyPrices[vcCode];
              var addCurrencyResult = server.AddUserVirtualCurrency({ PlayFabId: playfabId, VirtualCurrency: vcCode, Amount: amount });
              return {rewardVC: vcCode, rewardBalance: addCurrencyResult.Balance};
            }
        }
    }

    return {rewardVC: null, rewardBalance: 0};
}

function findItemInCatalogItems(catalogItems, itemid) 
{
    for (var i = 0; i < catalogItems.length; ++i)
    {
        if(catalogItems[i].ItemId == itemid)
        {
              return catalogItems[i];
        }
    }
	return null;
}
        
handlers.customCoupon = function (args)
{
  	// 타이틀 데이터에서 임의 지정한 쿠폰 리스트를 얻어옴
  	var titleData = server.GetTitleInternalData({ Keys: null });
  	var couponList = titleData.Data[TD_KEY_COUPONLIST];
  	var couponListjson = JSON.parse(couponList);
  	var couponInfo;
  	for (var j = 0; j < couponListjson.coupons.length; ++j)
	{
		// 들어온 코드와 동일한 쿠폰 검색
		var oneCoupon = couponListjson.coupons[j];
		if (oneCoupon.code == args.couponCode)
			couponInfo = oneCoupon;
	}
  
  	// 검색된 쿠폰이 없다
  	if (null == couponInfo)
    {
      	// 리딤쿠폰으로 시도
      	return redeemCouponProcess(args.couponCode, args.playfabId);
    }
  
  	// 쿠폰 인덱스를 이용해서 이 유저가 이미 사용한 쿠폰인지 확인
  	var userinternalData = server.GetUserInternalData({PlayFabId: args.playfabId, Keys: UD_KEY_USED_COUPON});
  	var usedCouponData = findInUserInternalData(userinternalData.Data, UD_KEY_USED_COUPON);
  	var finalUsedCouponArray;
  	if (null == usedCouponData)
    {
      	// 쿠폰 사용 정보가 없다면 새로 배열을 만들어서 넣어준다
      	finalUsedCouponArray = [ couponInfo.index ];
    }
  	else
    {
      	finalUsedCouponArray = JSON.parse(usedCouponData.Value);
      	for (var i = 0; i < finalUsedCouponArray.length; ++i)
        {
          	// 이미 이 쿠폰을 사용했다. 바로 리턴
          	if (couponInfo.index == finalUsedCouponArray[i])
              	return {rewardVC: null, rewardBalance: 0};
        }
      	// 쿠폰을 사용한것으로 표시한다.
      	finalUsedCouponArray.push(couponInfo.index);
    }
  
  	// 쿠폰 사용 표시 유저 데이터에 적용
  	var dataPayload = {};
  	dataPayload[UD_KEY_USED_COUPON] = JSON.stringify(finalUsedCouponArray);
  	server.UpdateUserInternalData({PlayFabId: args.playfabId, Data: dataPayload });

  	// 보상 적용
  	var addCurrencyResult = server.AddUserVirtualCurrency({ PlayFabId: args.playfabId, VirtualCurrency: couponInfo.vccode, Amount: couponInfo.amount });
  	return {rewardVC: couponInfo.vccode, rewardBalance: addCurrencyResult.Balance};
}

function findInUserInternalData(userData, findKey)
{
  	for (var key in userData)
    {
      	if (findKey == key)
          	return userData[key];
    }
  	return null;
}
