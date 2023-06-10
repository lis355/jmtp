const { EventEmitter } = require("events");
const net = require("net");

function readString(buffer, offset, length) {
	return buffer.toString("utf8", offset, offset + length);
}

function readUInt32BE(buffer, offset, length) {
	return buffer.readUInt32BE(offset);
}

module.exports = class Client extends EventEmitter {
	constructor(options) {
		super();

		this.setOptions(options);

		this.tcpSocket = (this.options.createSocket || (() => new net.Socket()))();

		this.buffers = [];
		this.buffersTotalLength = 0;
		this.offset = 0;
		this.messageLength = null;

		this.header = Buffer.alloc(4);

		this.tcpSocket
			.on("close", hadError => {
				this.emit("disconnect");
			})
			.on("connect", () => {
				this.emit("connect");
			})
			.on("data", data => {
				this.handleDataChunk(data);
			})
			.on("drain", () => {
			})
			.on("end", () => {
			})
			.on("error", error => {
				this.emit("error", error);
			})
			.on("lookup", () => {
			})
			.on("ready", () => {
			})
			.on("timeout", () => {
			});
	}

	setOptions(options) {
		this.options = options || {};

		if (this.options.createSocket &&
			typeof this.options.createSocket !== "function") throw new Error("createSocket option is incorrect");
	}

	connect(port, host) {
		this.tcpSocket.connect(port, host);

		return this;
	}

	disconnect() {
		this.tcpSocket.end();

		return this;
	}

	send(obj) {
		if (!obj) throw new Error("Empty message");

		const data = JSON.stringify(obj);

		const dataLength = Buffer.byteLength(data);
		this.header.writeUInt32BE(dataLength);

		this.tcpSocket.write(this.header);
		this.tcpSocket.write(data);
	}

	handleDataChunk(data) {
		this.buffers.push(data);
		this.buffersTotalLength += data.length;

		try {
			this.parse();
		} catch (error) {
			return this.handleError(error);
		}
	}

	parse() {
		let previousLength = 0;
		while (this.buffersTotalLength > 0 &&
			previousLength !== this.buffersTotalLength) {
			previousLength = this.buffersTotalLength;

			let message = null;
			if (this.messageLength === null) {
				if (this.buffersTotalLength >= this.header.length) {
					this.messageLength = this.consume(readUInt32BE, 4);
				}
			} else if (this.buffersTotalLength >= this.messageLength) {
				const str = this.consume(readString, this.messageLength);

				this.messageLength = null;
				message = JSON.parse(str);
			}

			if (message) this.emit("message", message);
		}
	}

	consume(readFunction, length) {
		this.buffersTotalLength -= length;

		let value;

		let firstBufferLength = this.buffers[0].length;
		if (this.offset + length <= firstBufferLength) {
			value = readFunction(this.buffers[0], this.offset, length);

			this.offset += length;

			if (this.offset === firstBufferLength) {
				this.offset = 0;
				this.buffers.shift();
			}
		} else {
			const valueBuffer = Buffer.alloc(length);

			let bufferPosition = 0;
			let remaining = length;
			while (remaining > 0) {
				firstBufferLength = this.buffers[0].length;
				const len = Math.min(remaining, firstBufferLength - this.offset);

				this.buffers[0].copy(valueBuffer, bufferPosition, this.offset, this.offset + len);

				bufferPosition += len;
				remaining -= len;

				if (len === (firstBufferLength - this.offset)) {
					this.offset = 0;
					this.buffers.shift();
				} else {
					this.offset += len;
				}
			}

			value = readFunction(valueBuffer, 0, length);
		}

		return value;
	}

	handleError(error) {
		this.tcpSocket.end();

		this.emit("error", error);
	}
};
