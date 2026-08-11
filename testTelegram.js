import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

async function sendTestMessage() {
	try {
		const response = await axios.post(
			`https://api.telegram.org/bot${token}/sendMessage`,
			{
				chat_id: chatId,
				text: "🚀 Campaign Watcher is working!",
			},
		);

		console.log("Message sent successfully!");
		console.log(response.data);
	} catch (error) {
		console.error("Failed to send message:");
		console.error(error.response?.data || error.message);
	}
}

sendTestMessage();