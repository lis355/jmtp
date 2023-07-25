const crypto = require("crypto");
const tls = require("tls");
const fs = require("fs");

require("dotenv-flow").config();
const { program } = require("commander");

program
	.option("--tls")
	.parse();

const options = program.opts();

const { createServer, createClient } = require("../index");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const PORT = parseFloat(process.env.PORT) || 8100;
const HOST = process.env.HOST || "localhost";

function md5(str) {
	return crypto.createHash("md5").update(str || "").digest("hex");
}

let serverOptions;
if (options.tls) {
	serverOptions = {
		port: PORT,
		createServer: () => {
			const certificates = {
				key: fs.readFileSync(process.env.SSL_PRIVATE_KEY_FILE_PATH),
				cert: fs.readFileSync(process.env.SSL_FULL_CHAIN_PEM_FILE_PATH)
			};

			return tls.createServer(certificates);
		}
	};
} else {
	serverOptions = {
		port: PORT
	};
}

const server = createServer(serverOptions)
	.on("listening", () => {
		console.log("server: started on port", server.options.port);
	})
	.on("connection", peer => {
		console.log("server: client connected", peer.socket.remoteAddress, peer.socket.remotePort);

		peer.on("message", message => {
			console.log("server: message from client with size", JSON.stringify(message).length, peer.socket.remoteAddress, peer.socket.remotePort);
			console.log(`server: message from client ${JSON.stringify(message)}`);

			peer.send({ hash: md5(JSON.stringify(message)) });
		});

		peer.on("disconnect", () => {
			console.log("server: client disconnected", peer.socket.remoteAddress, peer.socket.remotePort);

			server.close();
		});
	})
	.on("close", () => {
		console.log("server: closed");
	})
	.on("error", error => {
		console.log(`server: error ${error}`);
	})
	.listen();

let clientOptions;
if (options.tls) {
	clientOptions = {
		createSocket: () => tls.connect(PORT, HOST)
	};
} else {
	clientOptions = {
		host: HOST,
		port: PORT
	};
}

const client = createClient(clientOptions)
	.on("connect", () => {
		console.log(`client: connected to server ${HOST}:${PORT}`);

		client.data = { date: Date() };
		client.send(client.data);

		client.disconnect();
	})
	.on("disconnect", () => {
		console.log(`client: disconnected from server ${HOST}:${PORT}`);
	})
	.on("error", error => {
		console.log(`client: error ${error}`);
	})
	.on("message", message => {
		console.log("client: message from server with size", JSON.stringify(message).length);
		console.log(`client: message from server ${JSON.stringify(message)}`);

		console.log(md5(JSON.stringify(client.data)) === message.hash ? "OK" : "ERROR");
	});

if (!options.tls) client.connect();
