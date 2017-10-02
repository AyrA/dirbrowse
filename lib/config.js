const fs = require("fs");
const path = require("path");
const file = path.join(path.dirname(process.argv[1]), "config.json");
exports.def = {
	"access": {
		"enabled": false,
		"whitelist": "path/to/whitelist",
		"maxage": 60000
	},
	"server": {
		"tls": false,
		"key": "priv.key",
		"cert": "cert.crt",
		"ip": "127.0.0.1",
		"port": 6375
	},
	"workers": 0,
	"root": '.'
};

function clone(x) {
	return JSON.parse(JSON.stringify(x));
};

exports.saveDefault = function (cb) {
	return fs.writeFile(file, JSON.stringify(exports.def, undefined, '\t'), cb);
};

exports.load = function (cb) {
	return fs.readFile(file, "utf8", function (e, conf) {
		if (e) {
			//Can't read config. Return error and load defaults
			cb(e, clone(exports.def));
		} else {
			try {
				//Try to parse configuration
				var config = JSON.parse(conf);
				if (typeof(config.workers) != typeof(0)) {
					console.error("config.workers not specified or wrong. Setting to default");
					config.workers = exports.def.workers;
				}
				if (typeof(config.access) != typeof({})) {
					console.error("config.access not defined or wrong type. Setting to default");
					config.access = clone(exports.def.access);
				}
				if (typeof(config.server) != typeof({})) {
					console.error("config.server not defined or wrong type. Setting to default");
					config.server = clone(exports.def.server);
				}
				if (typeof(config.access.enabled) != typeof(true)) {
					console.error("config.access.enabled not defined or wrong type. Setting to default");
					config.access.enabled = exports.def.access.enabled;
				}
				if (typeof(config.server.tls) != typeof(true)) {
					console.error("config.server.tls not defined or wrong type. Setting to default");
					config.server.tls = exports.def.server.tls;
				}
				if (typeof(config.root) != typeof("")) {
					console.error("config.root not defined or wrong type. Setting to default");
					config.root = exports.def.root;
				}

			} catch (e) {
				//Error parsing configuration
				cb(e, null);
				return;
			}
			cb(e, clone(config));
		}
	});
};
