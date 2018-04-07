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
	isSandbox: true
});

//line bot
const lineBot = require("@line/bot-sdk");
const botConfig = {
	channelAccessToken: process.env.LINE_BOT_ACCESS_TOKEN,
	channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
};
const bot = new lineBot.Client(botConfig);

server.listen(process.env.PORT || 5000);

server.post("/webhook", lineBot.middleware(botConfig), (req, res, next) => {
	if (!Array.isArray(req.body.events)) {
		return res.status(500).end();
	}
	res.sendStatus(200);
	req.body.events.map((event) => {
		let context = cache.get(event.source.userId);

		if (!context){

			// [メモ]もしも、今後画像以外対応させるときに楽なようにswitch使ってます.
			switch (event.message.type) {
				case "text":
					console.log(`[Start]event.message.type === text`);
					console.log(event.message);
					const text = event.message.text;
					switch (text) {
						case "一覧":
							console.log(`TODO: 一覧表示`);
							const echo = {
								type: 'text',
								text: 'ls'
							};
							return bot.replyMessage(event.replyToken, echo);
							break;
						case /^購入/.test(text):
							console.log(`購入処理`);
							const splitedText = text.split(`　`);
							console.log(splitedText);
							break;
						case /^登録/.test(text):
							console.log(`登録処理`);
							break;
						default:
							console.log(`普通に買えって返す`);
							break;
					}
					break;
				default:
					console.log(`普通に買えって返す(text以外がきたよーん)`);
					break;
			}

			let message = {
				type: "template",
				altText: "You need to purchase subscription to use this Chatbot. It's 1yen/month. Do you want to puchase?",
				template: {
					type: "confirm",
					text: "You need to purchase subscription to use this Chatbot. It's 1yen/month. Do you want to purchase?",
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
		} else if (context.subscription === "inactive") {
			if (event.type === "postback"){
				if (event.postback.data === "yes"){
					let reservation = {
						productName: "My product",
						amount: 1,
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
							altText: "Please proceed to the payment.",
							template: {
								type: "buttons",
								text: "Please proceed to the payment.",
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