///////////////////////////////////////////////////////////////////////////////////////////////////////
// (https://api.playfab.com/Documentation/Server)
// (https://api.playfab.com/Documentation/Client/method/ExecuteCloudScript)
// (https://api.playfab.com/playstream/docs)
///////////////////////////////////////////////////////////////////////////////////////////////////////

var UD_KEY_USED_COUPON = "UsedCoupon";
var TD_KEY_COUPONLIST = "CouponList";

// Ŀ������ ���� �� äũ�� ������� ���ÿ� ó���ϴ� �Լ�
handlers.checkAndSubtractVirtualCurrency = function (args)
{
	var invenResult = server.GetUserInventory({PlayFabId: args.playfabId});
  	var numVirtualCurrency = invenResult.VirtualCurrency[args.code];
  	var vcRechargeTime = invenResult.VirtualCurrencyRechargeTimes[args.code];
  log.info(invenResult.VirtualCurrencyRechargeTimes);
  log.info( vcRechargeTime);
  	var secondsToRecharge = 0;
  	// ������ Ÿ���� 0 �̸� vcRechargeTime �� null�� �Ѿ���µ�
  	if (null != vcRechargeTime)
      	secondsToRecharge = vcRechargeTime.SecondsToRecharge;
 	if (numVirtualCurrency - args.amount < 0)
      	return {check: false, numModified: 0, rechargeTime: secondsToRecharge};
  
  	var subCurrencyResult = server.SubtractUserVirtualCurrency({ PlayFabId: args.playfabId, VirtualCurrency: args.code, Amount: args.amount });
  	return  {check: true, numModified: subCurrencyResult.Balance, rechargeTime: secondsToRecharge};
}

// Ŀ���ó��� ��ȯ(���԰���)
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

// ���� ��� -> ī�޷α׿��� �ش� ������ �˻� -> Ŀ���ÿ� �߰� 
function redeemCouponProcess(couponCode, playfabId)
{
    // ������ ���Ǹ� ���ϰ����� �ڵ�� �ִ°� �ƴ϶� �� �ͼ��� �� -_- Ŭ���ʿ��� �ڵ带 ã���� ������ �ش� ����ó���� Ŭ�󿡼� ��
    var result = server.RedeemCoupon({CouponCode: couponCode, PlayFabId: playfabId});

    // ������ �������� ī�޷α׿��� �˻�. 
    for (var i = 0; i < result.GrantedItems.length; ++i)
    {
        var itemInstance = result.GrantedItems[i];
        var catalog = server.GetCatalogItems({CatalogVersion: itemInstance.CatalogVersion});
        if (null == catalog)
          	continue;

        var foundItem = findItemInCatalogItems(catalog.Catalog, itemInstance.ItemId);

        // �ش� �������� price ���� �������� �ش�.
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
  	// Ÿ��Ʋ �����Ϳ��� ���� ������ ���� ����Ʈ�� ����
  	var titleData = server.GetTitleInternalData({ Keys: null });
  	var couponList = titleData.Data[TD_KEY_COUPONLIST];
  	var couponListjson = JSON.parse(couponList);
  	var couponInfo;
  	for (var j = 0; j < couponListjson.coupons.length; ++j)
    {
      	// ���� �ڵ�� ������ ���� �˻�
      	var oneCoupon = couponListjson.coupons[j];
      	if (oneCoupon.code == args.couponCode)
          	couponInfo = oneCoupon;
    }
  
  	// �˻��� ������ ����
  	if (null == couponInfo)
    {
      	// ������������ �õ�
      	return redeemCouponProcess(args.couponCode, args.playfabId);
    }
  
  	// ���� �ε����� �̿��ؼ� �� ������ �̹� ����� �������� Ȯ��
  	var userinternalData = server.GetUserInternalData({PlayFabId: args.playfabId, Keys: UD_KEY_USED_COUPON});
  	var usedCouponData = findInUserInternalData(userinternalData.Data, UD_KEY_USED_COUPON);
  	var finalUsedCouponArray;
  	if (null == usedCouponData)
    {
      	// ���� ��� ������ ���ٸ� ���� ���� �־��ش�
      	finalUsedCouponArray = [ couponInfo.index ];
    }
  	else
    {
      	finalUsedCouponArray = JSON.parse(usedCouponData.Value);
      	for (var i = 0; i < finalUsedCouponArray.length; ++i)
        {
          	// �̹� �� ������ ����ߴ�. �ٷ� ����
          	if (couponInfo.index == finalUsedCouponArray[i])
              	return {rewardVC: null, rewardBalance: 0};
        }
      	// ������ ����Ѱ����� ǥ���Ѵ�.
      	finalUsedCouponArray.push(couponInfo.index);
    }
  
  	// ���� ��� ǥ�� ���� �����Ϳ� ����
  	var dataPayload = {};
  	dataPayload[UD_KEY_USED_COUPON] = JSON.stringify(finalUsedCouponArray);
  	server.UpdateUserInternalData({PlayFabId: args.playfabId, Data: dataPayload });

  	// ���� ����
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