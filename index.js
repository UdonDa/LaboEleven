"use strict";
require("dotenv").config();

const server = require("express")();
const cache = require("memory-cache");
const fs = require("fs");
const mysql = require('mysql');
const connection = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	database: 'labeleven'
});

//mysql
connection.connect();

//Line Pay API
const linePay = require("line-pay");
const pay = new linePay({
	channelId: process.env.LINE_PAY_CHANNEL_ID,
	channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
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
var ITEM_NAME = '';
var ITEM_PRICE = '';

const ITEM_TABLE = {
	1: 150,//おにぎり
	2: 160,//飲み物
	3: 500,//弁当
	4: 220,//エナジードリンク
	5: 150,//アイス
};

const ITEM_NAME_TABLE = {
	1: 'おにぎり',
	2: '飲み物',
	3: '弁当',
	4: 'エナジードリンク',
	5: 'アイス'
};

server.post("/webhook", lineBot.middleware(botConfig), (req, res, next) => {
	if (!Array.isArray(req.body.events)) {
		return res.status(500).end();
	}

	res.sendStatus(200);
	req.body.events.map((event) => {
		const context = cache.get(event.source.userId);
		if (!context || context.subscription === "active") {
			switch (event.message.type) {
				case "text":
					const text = event.message.text;
					if (text === "一覧") {
						const items = Object.values(ITEM_NAME_TABLE);
						const prices = Object.values(ITEM_TABLE);
						var results = '';
						for (var id=0; id<items.length;id++) {
							results += `${id+1}. ${items[id]} : ${prices[id]}円\n`;
						}
						const message = getTextMessage(results);
						return bot.replyMessage(event.replyToken, message);

					} else if (/^購入/.test(text)) {
						//TODO: DBにないときの早期処理
						ITEM_NUMBER = text.match(/\d+/)[0];
						const items = Object.values(ITEM_NAME_TABLE);
						if (ITEM_NUMBER > items.length) {
							const message = getTextMessage(`この商品は現在取り扱ってないです`);
							return bot.replyMessage(event.replyToken, message);
						}
						const message = getConfirmMessage(0, ITEM_NUMBER);
						return bot.replyMessage(event.replyToken, message).then((response) => {
							setSubscription(event.source.userId, "inactive");
						});

					} else if (/^登録/.test(text)) {
						ITEM_NUMBER = text.match(/\d+/)[0];
						const items = Object.values(ITEM_NAME_TABLE);
						if (ITEM_NUMBER > items.length) {
							const message = getTextMessage(`この商品は現在取り扱ってないです`);
							return bot.replyMessage(event.replyToken, message);
						}
						const message = getConfirmMessage(1, ITEM_NUMBER);
						return bot.replyMessage(event.replyToken, message).then((response) => {
							setSubscription(event.source.userId, "inactive");
						});

					} else if (/^新規/.test(text)) {
						const [newItem, newPrice] = getNewItemAndPrice(text);
						ITEM_NAME = newItem;
						ITEM_PRICE = newPrice;
						if (typeof newItem !== 'string' || typeof newPrice !== 'number') {
							const message = getTextMessage(`新規　商品　値段　の順番で登録してください`);
							return bot.replyMessage(event.replyToken, message);
						}
						const message = getNewConfirmMessage(newItem, newPrice);
						return bot.replyMessage(event.replyToken, message).then((response) => {
							setSubscription(event.source.userId, "inactive");
						});
					} else {
						const message = getTextMessage(`~使い方~\n一覧 : 取り扱い商品一覧が出てきます\n購入 N : N番の商品が買えます\n登録 N : N番の商品を登録できます\n新規　商品　価格 : 商品を登録できます`);
						return bot.replyMessage(event.replyToken, message);
					}
					break;
				default:
					const message = getTextMessage(`~使い方~\n一覧 : 取り扱い商品一覧が出てきます\n購入 N : N番の商品が買えます\n登録 N : N番の商品を登録できます\n新規　商品　価格 : 商品を登録できます`);
					return bot.replyMessage(event.replyToken, message);
					break;
			}
		} else if (context.subscription === "inactive") {
			if (event.type === "postback") {
				if (event.postback.data === "yes") {
					const reservation = getReservationText(ITEM_NUMBER, event.source.userId, req.hostname);
					pay.reserve(reservation).then((response) => {
						reservation.transactionId = response.info.transactionId;
						reservation.userId = event.source.userId;
						cache.put(reservation.transactionId, reservation);
						const text = 'LINE Payでお支払いお願いします';
						const textForLogs = `ID:${event.source.userId} WHEN:${getTodayTimestamp()} ITEM_ID:${ITEM_NUMBER}\n`;
						fs.appendFileSync('logs_bought.txt', textForLogs, 'utf8');
						const message = getButtonsText(text, response.info.paymentUrl.web);
						return bot.replyMessage(event.replyToken, message).then((response) => {
							setSubscription(event.source.userId, "active")
						})
					}).then((response) => {
						return;
					});
				} else if (event.postback.data === "no") {
					const text = "そっか〜〜";
					const message = getTextMessage(text);
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				} else if (event.postback.data === "yes_enroll") {
					const text = "ご登録ありがとうございます";
					const textForLogs = `ID:${event.source.userId} WHEN:${getTodayTimestamp()} ITEM_ID:${ITEM_NUMBER}\n`;
					fs.appendFileSync('logs_enrolled.txt', textForLogs, 'utf8');
					const message = getTextMessage(text);
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				} else if (event.postback.data === "no_enroll") {
					const text = "そっかーーー";
					const message = getTextMessage(text);
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				} else if (event.postback.data === "yes_new_enroll") {
					const textMessage = event.message.text;
					const [newItem, newPrice] = getNewItemAndPrice(textMessage);
					const items = Object.values(ITEM_NAME_TABLE);
					ITEM_NAME_TABLE[items.length + 1] = newItem;
					ITEM_TABLE[items.length + 1] = newPrice;
					const textForLogs = `ID:${event.source.userId} WHEN:${getTodayTimestamp()} ITEM_ID:${items.length + 1}\n`;
					fs.appendFileSync('logs_enrolled.txt', textForLogs, 'utf8');
					const thanks = "ご登録ありがとうございます";
					const message = getTextMessage(thanks);
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				} else if (event.postback.data === "no_new_enroll") {
					const text = "そっかーーー";
					const message = getTextMessage(text);
					return bot.replyMessage(event.replyToken, message).then((response) => {
						cache.del(event.source.userId);
						return;
					});
				}
			}
		}
	});
});

server.get("/pay/confirm", (req, res, next) => {
	if (!req.query.transactionId) {
		return res.status(400).send("Transaction Id not found.");
	}
	const reservation = cache.get(req.query.transactionId);
	if (!reservation) {
		return res.status(400).send("Reservation not found.")
	}

	const confirmation = {
		transactionId: req.query.transactionId,
		amount: reservation.amount,
		currency: reservation.currency
	};
	return pay.confirm(confirmation).then((response) => {
		res.sendStatus(200);
		const messages = [{
			type: "sticker",
			packageId: 2,
			stickerId: 144
		}, {
			type: "text",
			text: "ありがとうございます!"
		}];
		return bot.pushMessage(reservation.userId, messages);
	}).then((response) => {
		cache.put(reservation.userId, {subscription: "active"});
	});
});


function getConfirmMessage(mode, itemNumber) {
	const BUY = 0;
	const ENROLL = 1;
	if (mode === BUY) {
		return {
			type: "template",
			altText: `${itemNumber}番の${ITEM_NAME_TABLE[itemNumber.toString()]}を購入しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()]}円になります`,
			template: {
				type: "confirm",
				text: `${itemNumber}番の${ITEM_NAME_TABLE[itemNumber.toString()]}を購入しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()]}円になります`,
				actions: [
					{type: "postback", label: "Yes", data: "yes"},
					{type: "postback", label: "No Thanks", data: "no"}
				]
			}
		}
	} else if (mode === ENROLL) {
		return {
			type: "template",
			altText: `${itemNumber}番の${ITEM_NAME_TABLE[itemNumber.toString()]}を登録しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()] + 20}円を差し上げます`,
			template: {
				type: "confirm",
				text: `${itemNumber}番の${ITEM_NAME_TABLE[itemNumber.toString()]}を登録しますか?\n${ITEM_TABLE[ITEM_NUMBER.toString()] + 20}円を差し上げます`,
				actions: [
					{type: "postback", label: "Yes", data: "yes_enroll"},
					{type: "postback", label: "No Thanks", data: "no_enroll"}
				]
			}
		}
	} else {
		return null;
	}
}

function getNewConfirmMessage(item, price) {
	return {
		type: "template",
		altText: `${item}を${price}円で新規登録しますか?`,
		template: {
			type: "confirm",
			text: `${item}を${price}円で新規登録しますか?`,
			actions: [
				{type: "postback", label: "Yes", data: "yes_new_enroll"},
				{type: "postback", label: "No Thanks", data: "no_new_enroll"}
			]
		}
	}
}

function getReservationText(itemNumber, userId, hostName) {
	return {
		productName: ITEM_NAME_TABLE[itemNumber.toString()],
		amount: ITEM_TABLE[itemNumber.toString()],
		currency: "JPY",
		confirmUrl: process.env.LINE_PAY_CONFIRM_URL || `https://${hostName}/pay/confirm`,
		confirmUrlType: "SERVER",
		orderId: `${userId}-${Date.now()}`
	};
}

function getButtonsText(text, uri) {
	return {
		type: "template",
		altText: text,
		template: {
			type: "buttons",
			text: text,
			actions: [
				{type: "uri", label: "Pay by LINE Pay", uri: uri},
			]
		}
	}
}

function getTextMessage(text) {
	return {
		type: 'text',
		text: text
	}
}

function getTodayTimestamp() {
	const date = new Date();
	return `${date.getFullYear()}${date.getMonth()}${date.getDate()}${date.getHours()}${date.getMinutes()}`
}

function setSubscription(userId, subscription) {
	return cache.put(userId, {
		subscription: subscription
	});
}

function getNewItemAndPrice(text) {
	const splitedText = text.split("　");
	const newItem = splitedText[splitedText.length - 2];
	const newPrice = splitedText[splitedText.length - 1];
	return [newItem, parseInt(newPrice, 10)]
}