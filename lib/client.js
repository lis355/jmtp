const { EventEmitter } = require("events");
const net = require("net");

// ПРОТОКОЛ *****************************************************************************************

// Сообщение состоит из
// 1 заголовок - 4 байта UInt32BE - длина данных
// 2 данные - строка в формате utf8

// **************************************************************************************************

// DataReciever
// Класс для чтения входного потока данных
// Т.к. данные приходят в виде буферов заранее неизвестного раздела, то чтение входных сообщений устроено так

// Логика реализована стейт машиной - мы "ожидаем" пока придет нужное количество байт, считываем их как данные известного нам заранее представления
// по протоколу (число или строка в формате utf8), и обрабатываем.
// Сейчас логика такая - ждем заголовок 4 байта, читаем его, ждем данные из [заголовок-длина] байтов

// Есть функция waitForDataBytes которая "ожидаиет", пока придет size (или больше) байтов, переводит состояние в nextState,
// записывает буфер bufferForReading, из которого потом нужно читать waitingDataSizeInBytes

// При поступлении на всох нового буфера с данными, мы кладем его в массив this.buffers и запускаем логику обработки входных данных
// this.buffersLength - общая длина всех this.buffers
// this.currentPosition - позиция на считывание в первом буфере. Соответсвенно, она может быть от 0 до this.buffers[0].length - 1,
// и, как только удаляется первый буфер - она сбрасывается на 0

// Суть в том, что, если нужно считать определенное количество байт (вызвали функцию waitForDataBytes), то либо первый буфер большой
// (текущая позиция в нем и нужный размер на считывание меньше его длины), и мы будем считывать из него,
// либо нет - тогда нужно формировать временной буфер и заполнять его. По сути, мы перебираем все буферы, пока не скопируем во временной буфер
// необходимое колиечство байт для считывание

// При выделении временного буфера пользуемся оптимизом - выделяем наибольшее ближайшее степень двойки байт

function upperPowerOf2(x) {
	let power = 1;
	while (power < x) power *= 2;

	return power;
}

const STATE_IDLE = 0;
const STATE_WAITING_DATA_BYTES = 1;

class DataReciever extends EventEmitter {
	constructor() {
		super();

		this.state = STATE_IDLE;

		this.waitingDataSizeInBytes = 0;
		this.nextState = null;

		this.buffers = [];
		this.currentPosition = 0;
		this.buffersLength = 0;

		this.bufferForReading = null;
		this.tmpBuffer = null;
	}

	processDataChunk(data) {
		if (!data) throw new Error("Null buffer");
		if (data.length === 0) throw new Error("Zero buffer");

		this.buffers.push(data);

		this.buffersLength += data.length;

		this.process();
	}

	setState(value) {
		if (this.state === value) throw new Error(`Same state ${value}`);

		this.state = value;

		this.process();
	}

	waitForDataBytes(size, nextState) {
		this.waitingDataSizeInBytes = size;
		this.nextState = nextState;

		this.setState(STATE_WAITING_DATA_BYTES);
	}

	process() {
		if (this.state === STATE_WAITING_DATA_BYTES &&
			this.buffersLength - this.currentPosition >= this.waitingDataSizeInBytes) {
			this.prepareBufferForReading(this.waitingDataSizeInBytes);
			this.setState(this.nextState);
		}
	}

	prepareBufferForReading(size) {
		let firstBuffer = this.buffers[0];
		let firstBufferLength = firstBuffer.length;
		if (firstBufferLength - this.currentPosition >= size) {
			this.bufferForReading = firstBuffer;
			this.bufferForReadingPosition = this.currentPosition;

			this.currentPosition += size;

			if (this.currentPosition === firstBufferLength) this.shiftBuffers();
		} else {
			if (!this.tmpBuffer ||
				this.tmpBuffer.length < size) {
				this.tmpBuffer = Buffer.allocUnsafe(upperPowerOf2(size));
				// console.log(`Need ${size}, allocated ${this.tmpBuffer.length} bytes buffer`);
			}

			this.bufferForReading = this.tmpBuffer;
			this.bufferForReadingPosition = 0;

			for (let writingPosition = 0; writingPosition < size;) {
				firstBuffer = this.buffers[0];
				firstBufferLength = firstBuffer.length;
				const writingLength = Math.min(size - writingPosition, firstBufferLength - this.currentPosition);
				firstBuffer.copy(this.bufferForReading, writingPosition, this.currentPosition, this.currentPosition + writingLength);

				writingPosition += writingLength;
				this.currentPosition += writingLength;

				if (this.currentPosition === firstBufferLength) this.shiftBuffers();
			}
		}
	}

	shiftBuffers() {
		this.buffersLength -= this.buffers[0].length;
		this.buffers.shift();
		this.currentPosition = 0;
	}
}

const STATE_PROCESS_MESSAGE_LENGTH = 100;
const STATE_PROCESS_MESSAGE_BODY = 200;

class JsonTCPDataReciever extends DataReciever {
	process() {
		super.process();

		switch (this.state) {
			case STATE_IDLE: {
				this.waitForDataBytes(4, STATE_PROCESS_MESSAGE_LENGTH);

				break;
			}

			case STATE_PROCESS_MESSAGE_LENGTH: {
				const messageBodyLength = this.bufferForReading.readUInt32BE(this.bufferForReadingPosition);
				if (messageBodyLength <= 0) throw new Error(`Bad messageBodyLength ${messageBodyLength}`);

				this.waitForDataBytes(messageBodyLength, STATE_PROCESS_MESSAGE_BODY);

				break;
			}

			case STATE_PROCESS_MESSAGE_BODY: {
				const messageStr = this.bufferForReading.toString("utf8", this.bufferForReadingPosition, this.bufferForReadingPosition + this.waitingDataSizeInBytes);
				const message = JSON.parse(messageStr);

				this.emit("message", message);

				this.setState(STATE_IDLE);

				break;
			}
		}
	}
}

module.exports = class Client extends EventEmitter {
	constructor(options) {
		super();

		this.setOptions(options);

		this.socket = (this.options.createSocket || (() => new net.Socket()))();

		this.header = Buffer.allocUnsafe(4);

		this.dataReciever = new JsonTCPDataReciever();
		this.dataReciever.on("message", this.handleDataRecieverMessage.bind(this));

		this.socket
			.on("close", hadError => {
				this.emit("disconnect");
			})
			.on("connect", () => {
				if (this.socket.ssl) return;

				this.emit("connect");
			})
			.on("secureConnect", () => {
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

	connect() {
		if (!this.options.host) throw new Error(`Host option ${this.options.host} is incorrect`);

		if (!Number.isFinite(this.options.port)) throw new Error(`Port option ${this.options.port} is incorrect`);

		this.socket.connect(this.options.port, this.options.host);

		return this;
	}

	disconnect() {
		this.socket.end();

		return this;
	}

	send(obj) {
		if (!obj) throw new Error("Empty message");

		const data = JSON.stringify(obj);

		const dataLength = Buffer.byteLength(data);
		this.header.writeUInt32BE(dataLength);

		this.socket.write(this.header);
		this.socket.write(data);
	}

	handleDataChunk(data) {
		// function splitBufferToPars(buffer, partSize) {
		// 	const result = [];

		// 	let r = data.length;
		// 	let i = 0;
		// 	while (r > 0) {
		// 		const length = Math.min(data.length, r, partSize);
		// 		const partBuffer = Buffer.allocUnsafe(length);
		// 		buffer.copy(partBuffer, 0, i, i + length);
		// 		// console.log(`H ${partBuffer.length} ${partBuffer.toString()}`);
		// 		result.push(partBuffer);
		// 		r -= length;
		// 		i += length;
		// 	}

		// 	return result;
		// }

		try {
			// const N = 8;
			// for (const b of splitBufferToPars(data, N)) this.dataReciever.processDataChunk(b);

			this.dataReciever.processDataChunk(data);
		} catch (error) {
			return this.handleError(error);
		}
	}

	handleDataRecieverMessage(message) {
		this.emit("message", message);
	}

	handleError(error) {
		this.socket.end();

		this.emit("error", error);
	}
};
