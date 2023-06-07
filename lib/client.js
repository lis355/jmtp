const { EventEmitter } = require("events");
const net = require("net");

// JSON TCP PEER Protocol
// version 1
// Frame (message)
// sign 4 bytes const 174021652
// data length 4 bytes
// data (up to 2^32 bytes)

function readString(buffer, offset, length) {
	return buffer.toString("utf8", offset, offset + length);
}

function readUInt32BE(buffer, offset, length) {
	return buffer.readUInt32BE(offset);
}

const SIGN = 174021652;

class Client extends EventEmitter {
	constructor(tcpSocket = null) {
		super();

		this.tcpSocket = tcpSocket || new net.Socket();

		this.buffers = [];
		this.buffersTotalLength = 0;
		this.offset = 0;
		this.messageLength = null;

		this.header = Buffer.alloc(8);
		this.header.writeUInt32BE(SIGN, 0);

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

	connect(port, host) {
		this.tcpSocket.connect(port, host);

		return this;
	}

	disconnect() {
		this.tcpSocket.end();

		return this;
	}

	send(obj) {
		const message = JSON.stringify(obj);

		const messageLength = Buffer.byteLength(message);
		this.header.writeUInt32BE(messageLength, 4);

		this.tcpSocket.write(this.header);
		this.tcpSocket.write(message);
	}

	handleDataChunk(data) {
		this.buffers.push(data);
		this.buffersTotalLength += data.length;

		this.parse();
	}

	parse() {
		let previousLength = 0;
		while (this.buffersTotalLength > 0 &&
			previousLength !== this.buffersTotalLength) {
			previousLength = this.buffersTotalLength;

			let message = null;
			if (this.messageLength === null) {
				if (this.buffersTotalLength >= 8) {
					const signature = this.consume(readUInt32BE, 4);
					if (signature !== SIGN) return this.handleError(new Error("Bad signature " + signature));

					this.messageLength = this.consume(readUInt32BE, 4);
				}
			} else if (this.buffersTotalLength >= this.messageLength) {
				const str = this.consume(readString, this.messageLength);

				this.messageLength = null;
				try {
					message = JSON.parse(str);
				} catch (error) {
					return this.handleError(error);
				}
			}

			if (message) this.emit("message", message);
		}
	}

	consume(fcn, length) {
		this.buffersTotalLength -= length;

		if (this.offset + length <= this.buffers[0].length) {
			const val = fcn(this.buffers[0], this.offset, length);
			this.offset += length;

			if (this.offset === this.buffers[0].length) {
				this.offset = 0;
				this.buffers.shift();
			}

			return val;
		} else {
			const buf = Buffer.alloc(length);

			let bufPos = 0;
			let rem = length;
			while (rem > 0) {
				const len = Math.min(rem, this.buffers[0].length - this.offset);

				this.buffers[0].copy(buf, bufPos, this.offset, this.offset + len);

				bufPos += len;
				rem -= len;
				if (len === (this.buffers[0].length - this.offset)) {
					this.offset = 0;
					this.buffers.shift();
				} else {
					this.offset += len;
				}
			}

			const val = fcn(buf, 0, length);
			return val;
		}
	}

	handleError(error) {
		this.tcpSocket.end();

		this.emit("error", error);
	}
}

module.exports = function createClient(tcpSocket) {
	return new Client(tcpSocket);
};
