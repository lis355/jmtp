const Client = require("./lib/client");
const Server = require("./lib/server");

module.exports = {
	createClient: function (options) {
		return new Client(options);
	},
	createServer: function (options) {
		return new Server(options);
	}
};
