# POLハッカソン
~ ハッカソンでeslint使うやつまじで0人説 ~

# 要件定義

## 購入者
1. LineBotに対して商品番号を送る（ex: ```購入 1```)
2. Botから支払いするように命じられる
3. oneClickで購入

### メリット
購入者にとっては, 研究室にいながら, ものが買える
### デメリット
割高

## 登録者
1. LineBotに対して商品番号を送る（e: ```登録 1```）
2. Botから金額が支払われる
3. 受け取る

### メリット
どこか行くついでに物を買うと, ```テーブル価格 - 買った金額 - 10```のお金が貰える
### デメリット
めんどくさい

## テーブル
商品
id item price
1 おにぎり 150
2 うどん 400  


## 備考
+ どちらも、金額は下記のpriceに準ずる.
+ 差額の10yenが貯まれば、みんなで鍋パを行うものとする.

### おまけ
+ もしも、No thanksおさずに鯖更新した時は, switchのスコープコメントアウトして、以下を実行する
```
// No thanks押し忘れた時用
// const message = {
// 	type: "template",
// 	altText: "You need to purchase subscription to use this Chatbot. It's 1yen/month. Do you want to puchase?",
// 	template: {
// 		type: "confirm",
// 		text: "You need to purchase subscription to use this Chatbot. It's 1yen/month. Do you want to purchase?",
// 		actions: [
// 			{type: "postback", label: "Yes", data: "yes"},
// 			{type: "postback", label: "No Thanks", data: "no"}
// 		]
// 	}
// };
// return bot.replyMessage(event.replyToken, message).then((response) => {
// 	cache.put(event.source.userId, {
// 		subscription: "inactive"
// 	});
// });
```
