"use strict";
require("dotenv").config();

const server = require("express")();
const cache = require("memory-cache");
const path = require("path");
const session = require("express-session");

//Line Pay API
const linePay = require("line-pay");
const pay = new linePay({
	channelId: process.env.LINE_PAY_CHANNEL_ID,
	channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
	//hostname: process.env.LINE_PAY_HOSTNAME,
	hostname: process.env.QUOTAGUARDSTATIC_URL,
	isSandbox: true,
});

//line bot
const lineBot = require("@line/bot-sdk");
const botConfig = {
	channelAccessToken: process.env.LINE_BOT_ACCESS_TOKEN,
	channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
};
const bot = new lineBot.Client(botConfig);

server.listen(process.env.PORT || 5000);

var ITEM_NUMBER = 0;

const ITEM_TABLE = {
	1: 150,//おにぎり
	2: 160,//飲み物
	3: 500,//弁当
	4: 220,//エナジードリンク
};

const ITEM_NAME_TABLE = {
	1: 'おにぎり',
	2: '飲み物',
	3: '弁当',
	4: 'エナジードリンク'
};



server.post("/webhook", lineBot.middleware(botConfig), (req, res, next) => {
	console.log(`[ITEM_NUMBER] ${ITEM_NUMBER}`);
	if (!Array.isArray(req.body.events)) {
		return res.status(500).end();
	}
	res.sendStatus(200);
	req.body.events.map((event) => {
		let context = cache.get(event.source.userId);
		console.log(context);

		if (!context){

			// [メモ]もしも、今後画像以外対応させるときに楽なようにswitch使ってます.
			switch (event.message.type) {
				case "text":
					console.log(`[Start]event.message.type === text`);
					console.log(event.message);
					const text = event.message.text;
						if (text === "一覧") {
							console.log(`TODO: 一覧表示`);
							const echo = {
								type: 'text',
								text: 'ls'
							};
							return bot.replyMessage(event.replyToken, echo);
						} else if (/^購入/.test(text)) {
							console.log(`購入処理`);
							//TODO: DBにないときの早期処理
							ITEM_NUMBER = text.match(/\d+/)[0];

							console.log(`[ITEM_NUMBER]` + ITEM_NUMBER);
							const message = {
								type: "template",
								altText: `${ITEM_NUMBER}番の${ITEM_NAME_TABLE[ITEM_NUMBER.toString()]}を購入しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()]}円になります`,
								template: {
									type: "confirm",
									text: `${ITEM_NUMBER}番の${ITEM_NAME_TABLE[ITEM_NUMBER.toString()]}を購入しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()]}円になります`,
									actions: [
										{type: "postback", label: "Yes", data: "yes"},
										{type: "postback", label: "No Thanks", data: "no"}
									]
								}
							};
							return bot.replyMessage(event.replyToken, message).then((response) => {
								cache.put(event.source.userId, {
									subscription: "inactive"
								});
							});
						} else if (/^登録/.test(text)) {
							console.log(`登録処理`);
						} else {
							console.log(`普通に買えって返す`);
						}
					break;
				default:
					console.log(`普通に買えって返す(text以外がきたよーん)`);
					break;
			}

			// let message = {
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
			return bot.replyMessage(event.replyToken, message).then((response) => {
				cache.put(event.source.userId, {
					subscription: "inactive"
				});
			});
		} else if (context.subscription === "inactive") {
			if (event.type === "postback"){
				if (event.postback.data === "yes"){
					let reservation = {
						productName: ITEM_NAME_TABLE[ITEM_NUMBER.toString()],
						amount: ITEM_TABLE[ITEM_NUMBER.toString()],
						currency: "JPY",
						confirmUrl: process.env.LINE_PAY_CONFIRM_URL || `https://${req.hostname}/pay/confirm`,
						confirmUrlType: "SERVER",
						orderId: `${event.source.userId}-${Date.now()}`
					};

					// Call LINE Pay reserve API.
					pay.reserve(reservation).then((response) => {
						reservation.transactionId = response.info.transactionId;
						reservation.userId = event.source.userId;
						cache.put(reservation.transactionId, reservation);

						let message = {
							type: "template",
							altText: `LINE Payでお支払いよろしくおねがしいます`,
							template: {
								type: "buttons",
								text: `LINE Payでお支払いよろしくおねがしいます`,
								actions: [
									{type: "uri", label: "Pay by LINE Pay", uri: response.info.paymentUrl.web},
								]
							}
						};
						// Now we can provide payment URL.
						return bot.replyMessage(event.replyToken, message);
					}).then((response) => {
						return;
					});
				} else {
					// User does not purchase so say good bye.

					let message = {
						type: "text",
						text: "OK. Have a nice day."
					};
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				}
			}
		} else if (context.subscription === "active"){
			// User has the active subscription.

			debug(`User has the active subscription.`);

			delete event.message.id;
			return bot.replyMessage(event.replyToken, event.message).then((response) => {
				return;
			});
		}
	});
});

// If user approve the payment, LINE Pay server call this webhook.
server.get("/pay/confirm", (req, res, next) => {
	if (!req.query.transactionId){
		return res.status(400).send("Transaction Id not found.");
	}

	// Retrieve the reservation from database.
	let reservation = cache.get(req.query.transactionId);
	if (!reservation){
		return res.status(400).send("Reservation not found.")
	}

	let confirmation = {
		transactionId: req.query.transactionId,
		amount: reservation.amount,
		currency: reservation.currency
	};
	return pay.confirm(confirmation).then((response) => {
		res.sendStatus(200);

		let messages = [{
			type: "sticker",
			packageId: 2,
			stickerId: 144
		},{
			type: "text",
			text: "Congratulations! Now your chatbot is fully functional."
		}];
		return bot.pushMessage(reservation.userId, messages);
	}).then((response) => {
		cache.put(reservation.userId, {subscription: "active"});
	});
});