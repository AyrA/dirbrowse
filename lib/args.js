//This parses the command line arguments

//File System
const fs = require("fs");

//Number of CPU Cores
const numCPUs = require("os").cpus().length;

//Parse command line arguments into structure
module.exports = function () {
	var a = process.argv.concat([]);
	var ret = {
		download: false
	};
	while (a.length > 0) {
		var c = a.shift();
		if (!ret.node) {
			ret.node = c;
		} else if (!ret.script) {
			ret.script = c;
		} else {
			switch (c) {
				//Listener
			case "-l":
			case "--listen":
				if (ret.ip || ret.port) {
					return "Duplicate listen argument found";
				}
				var ipseg = a.shift();
				if (ipseg.indexOf(':') > 0) {
					ipseg = [
						//Parse IP and remove brackets if existing. Brackets allow for IPv6
						ipseg.substr(0, ipseg.lastIndexOf(':')).replace(/^\[/, "").replace(/\]$/, ""),
						//Parses the Port
						parseInt(ipseg.substr(ipseg.lastIndexOf(':') + 1))
					];
					if (ipseg[0].length == 0) {
						return "IP address on listener argument can't be empty"
					}
					if (isNaN(ipseg[1]) || ipseg[1] < 1 || ipseg[1] >= (1 << 16)) {
						return "Port must be in the range 1 - " + ((1 << 16) - 1);
					}
					ret.ip = ipseg[0];
					ret.port = ipseg[1];
				} else {
					return "listen argument must be IP:Port";
				}
				break;
				//Workers
			case "-w":
			case "--workers":
				if (ret.workers !== undefined) {
					return "Duplicate worker argument found";
				}
				var wcount = a.shift();
				ret.workers = parseInt(wcount);
				if (isNaN(ret.workers)) {
					//Safety override
					if (wcount.substr(0, 1) === '!' && parseInt(wcount.substr(1)) > 0) {
						ret.workers = parseInt(wcount.substr(1));
					} else {
						return "Invalid worker count. Must be a number. Use '--help' for more information";
					}
				}
				//negative workers tell the system how many CPU cores *not* to use
				else if (ret.workers < 0) {
					if (numCPUs + ret.workers < 1) {
						return "Invalid negative worker count. If negative it must be less than the CPU count";
					} else {
						ret.workers = numCPUs + ret.workers;
					}
				}
				//Autodetect
				else if (ret.workers === 0) {
					ret.workers = numCPUs;
				}
				//Require safety override
				else if (ret.workers > numCPUs * 4) {
					return "For safety, prepend '!' to the worker count when exceeding 4 times the CPU count of " +
					(numCPUs * 4) + ". Example: '!" +
					(numCPUs * 4 + 1) + "'";
				}
				break;
				//TLS Key and Cert
			case "-k":
			case "--key":
				if (ret.key || ret.cert) {
					return "Duplicate TLS key argument found";
				}
				ret.key = a.shift();
				ret.cert = a.shift();
				if (!ret.key) {
					return "Key argument requires two parameters, key and certificate. None were given";
				}
				if (ret.key && !ret.cert) {
					return "Key argument requires two parameters, key and certificate. Only key was given";
				}
				try {
					if (!fs.statSync(ret.key).isFile()) {
						return "Key file is not a file";
					}
					ret.key = fs.readFileSync(ret.key, "utf8");
				} catch (e) {
					return "Key file is inaccessible";
				}
				try {
					if (!fs.statSync(ret.cert).isFile()) {
						return "certificate file is not a file";
					}
					ret.cert = fs.readFileSync(ret.cert, "utf8");
				} catch (e) {
					return "certificate file is inaccessible";
				}
				break;
				//Force Download
			case "-d":
			case "--download":
				if (!ret.download) {
					ret.download = true;
				} else {
					return "Duplicate download argument found";
				}
				break;
			default:
				//First unknown Argument is the root directory
				if (!ret.root) {
					ret.root = c;
					try {
						if (!fs.statSync(c).isDirectory()) {
							return "root parameter is not a directory";
						}
					} catch (e) {
						return "root directory is invalid";
					}
				} else {
					return "Unsupported argument: " + c;
				}
			}
		}
	}
	if (!ret.node || !ret.script) {
		return "Node changed how it parses arguments. Aborting...";
	}
	/*
	//apply defaults. Any invalid value at that point means it has not been defined
	if (!ret.ip) {
		ret.ip = '127.0.0.1';
	}
	if (isNaN(ret.port)) {
		ret.port = 6375;
	}
	if (isNaN(ret.workers)) {
		ret.workers = numCPUs
	}
	//*/
	return ret;
};
