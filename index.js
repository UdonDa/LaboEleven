"use strict";
require("dotenv").config();

const server = require("express")();
const cache = require("memory-cache");
const path = require("path");

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

	Promise
		.all(req.body.events.map(handleEvent))
		.then((result) => res.json(result))
		.catch((err) => {
			console.error(err);
			res.status(500).end();
		});
});

// event handler
function handleEvent(event) {
	if (event.type !== 'message' || event.message.type !== 'text') {
		// ignore non-text-message event
		return Promise.resolve(null);
	}

	// create a echoing text message
	const echo = { type: 'text', text: event.message.text };

	// use reply API
	return bot.replyMessage(event.replyToken, echo);
}