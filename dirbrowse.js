//EXTERNALS
//=========
//Web Server
const http = require("http");
//TLS Server
const https = require("https");
//HTTP 206 Support (Partial Content Response)
const send = require("send");
//URL Parser for File sender
const parseUrl = require("parseurl");
//IP Matching
const ipcheck = require("./lib/ip.js");
//Argument parser
const argParse = require("./lib/args.js");
//Configuration
const config = require("./lib/config.js");

//INTERNALS
//=========
//File System
const fs = require("fs");
//Path String parsing
const path = require("path");
//Detect Mime Types
const mime = require("mime-types");
//Node Cluster
const cluster = require("cluster");

//Number of CPU Cores
const numCPUs = require("os").cpus().length;

//Custom Files Directory
const customdir = path.join(path.dirname(process.argv[1]), '~');

//Check for help before anything else.
if (argParse.isHelp()) {
	console.error("Command line: " + path.basename(process.argv[0]) + " " + path.basename(process.argv[1]) + " [root] [-s IP:port] [-w procs] [-k key cert] [-d]");
	console.error(argParse.getHelp());
	process.exit(0);
}

//Command line arguments
var args = argParse.getArguments();

//If args is a string, it's an error message
if (typeof(args) == typeof("")) {
	console.error("Error parsing command line arguments:", args);
	console.error("Use --help for command line details");
	process.exit(1);
}

//Default pages
var pages = {
	err: fs.readFileSync(path.join(customdir, "error.html"), "utf-8"),
	dir: fs.readFileSync(path.join(customdir, "dir.html"), "utf-8")
};

//Directory/Stat cache
var cache = {};

//Handle Errors
function getError(code, ip, body) {
	return pages.err.replace(/\[CLUSTER\]/g, cluster.worker.id).replace(/\[IP\]/g, ip).replace(/\[CODE\]/g, code).replace(/\[BODY\]/g, body);
}

//Handle Directory listing as async (which is a pain in the ass to be honest)
function listDir(directory, url, ip, cb) {
	var readDone = function (err, dirlist) {
		if (!err) {
			var text = "<a class='dir-link dir-up' href='..'>..</a><br />";
			for (var key in dirlist) {
				text += "<a class='" + (dirlist[key].isDirectory() ? "dir" : "file") + "-link' href='" + encodeURIComponent(key) + "/'>" + key + "</a>";
			}
			cb(null, pages.dir.replace(/\[ROOT\]/g, "/" + url).replace(/\[CLUSTER\]/g, cluster.worker.id).replace(/\[IP\]/g, ip).replace(/\[BODY\]/g, text));
		} else {
			cb(err, null);
		}
	};

	if (cache[directory] && Date.now() - cache[directory].age < 60000) {
		readDone(null, cache[directory].data);
	} else {
		console.log("Building cache for", directory);
		fs.readdir(directory, function (err, dirlist) {
			if (!err) {
				cache[directory] = {
					data: {}
				};
				var proc = function () {
					if (dirlist.length > 0) {
						var dir = dirlist.shift();
						fs.lstat(path.join(directory, dir), function (err, stat) {
							if (!err) {
								cache[directory].data[dir] = stat;
							}
							proc();
						});
					} else {
						readDone(err, cache[directory].data);
					}
				};
				proc();
				cache[directory].age = Date.now();
			} else {
				readDone(err, null);
			}
		});
	}
}

//Handle HTTP request
function request(req, res) {

	var IP = req.connection.remoteAddress;
	//Request URL without leading slashes
	var requestdir = decodeURIComponent(req.url).replace(/^\/+/, "");

	//Always permit access to the static directory
	if (requestdir.indexOf("~/") < 0 && !ipcheck.canAccess(IP)) {
		//No Access
		res.writeHead(403, {
			"Content-Type": "text/html",
			//Set expiration date of IP specific errors to the cache age.
			Expires: (new Date(ipCache.age + ipCacheAge)).toUTCString()
		});
		res.end(getError(403, IP, "IP Address is blocked.<br /><a href='https://master.ayra.ch/Video/add.php'>[UNBLOCK]</a><br /><br /><i>If you are sure that the IP should have access, you are definitely wrong</i>"));
	} else {
		//Build expiration dates
		var expiration = {
			err: (new Date(Date.now() + 600000)).toUTCString(), //10 min for error
			dir: (new Date(Date.now() + 60000)).toUTCString(), // 1 min for directory
			stat: (new Date(Date.now() + 86400000)).toUTCString(), // 1 day for static resources
			file: (new Date(Date.now() + 86400000)).toUTCString() // 1 day for files
		};
		//Set correct virtual/absolute path
		var urlpath =
			requestdir.indexOf("~/") < 0 ?
			path.normalize(path.join(args.root, requestdir)) :
			path.normalize(path.join(customdir, requestdir.substr(2)));

		fs.stat(urlpath, function (err, stat) {
			if (!err) {
				if (stat.isDirectory()) {
					//Show Directory
					listDir(urlpath, requestdir, IP, function (err, dirlistHtml) {
						if (!err) {
							//Write Directory result
							res.writeHead(200, {
								"Content-Type": "text/html",
								Expires: expiration.dir
							});
							res.end(dirlistHtml);
						} else {
							//Error accessing directory
							res.writeHead(403, {
								"Content-Type": "text/html",
								Expires: expiration.err
							});
							res.end(getError(403, IP, "Directory is inacessible.<br /><a href='/'>[ROOT]</a><br /><br /><i>If you are absolutely sure that the directory should be accessible, you are wrong</i>"));
						}
					});
				} else {
					//Send File
					send(req, parseUrl(req).pathname, {
						root: requestdir.indexOf("~/") < 0 ? args.root : path.resolve(path.join(customdir, "..")),
						dotfiles: "deny"
					})
					//Handle Error
					.on("error", function (err) {
						if (err.message === "Forbidden") {
							res.writeHead(403, {
								"Content-Type": "text/html",
								Expires: expiration.err
							});
							res.end(getError(403, IP, "Access to File denied.<br /><a href='/'>[ROOT]</a><br /><br /><i>If you are absolutely sure that the file should be accessible, you are wrong</i>"));
						} else {
							console.log("error:", err.message);
							res.writeHead(404, {
								"Content-Type": "text/html",
								Expires: expiration.err
							});
							res.end(getError(404, IP, "File not found.<br /><a href='/'>[ROOT]</a><br /><br /><i>If you are absolutely sure that the file/directory has to exist, you are wrong</i>"));
						}
					})
					//Handle headers
					.on("headers", function (res, path, stat) {
						res.setHeader("Content-Type", mime.lookup(path));
						//Make static resources not expire too quickly
						if (requestdir.indexOf("~/") === 0) {
							res.setHeader("Expires", expiration.stat);
						}
						if (args.download) {
							res.setHeader("Content-Disposition", "attachment");
						}
					})
					//Pipe output to response
					.pipe(res);
				}
			} else {
				//Does not exists
				res.writeHead(404, {
					"Content-Type": "text/html",
					Expires: expiration.err
				});
				res.end(getError(404, IP, "File or directory not found.<br /><a href='/'>[ROOT]</a><br /><br /><i>If you are absolutely sure that the file/directory has to exist, you are wrong</i>"));
			}
		});
	}
}

function numToCPU(number) {
	if (typeof(number) === typeof("") || typeof(number) === typeof(0)) {
		if (isNaN(number)) {
			//Safety override
			if (number.substr(0, 1) === '!' && parseInt(number.substr(1)) > 0) {
				return parseInt(number.substr(1));
			} else {
				return null;
			}
		}
		//negative workers tell the system how many CPU cores *not* to use
		else if (number === 0) {
			//Use CPU count if number is 0
			return numCPUs;
		} else if (number < 0) {
			if (numCPUs + number < 1) {
				//If number is negative it's absolute value can't be equal or larger than the CPU count
				return null;
			} else {
				//Number is the amount of cores to leave unused
				return numCPUs + number;
			}
		}
		//Number can be used as-is
		return number;
	}
	//Return null on invalid argument
	return null;
}

////////////////////
//Startup sequence//
////////////////////

//Load configuration
config.load(function (err, data) {

	//Error and no data means that the config exists and is invalid
	if (err && !data) {
		console.error("Error loading config file:", err.message);
		process.exit(1);
	}
	//Error and data means that a default was created and loaded
	if (err && data) {
		console.log("config.json not available. Saving defaults. Please edit");
		config.saveDefault();
	}
	//Set IP and Port if Argument for IP was not provided
	if (!args.ip) {
		args.ip = data.server.ip;
		args.port = data.server.port;
	}
	//Set root if Argument was not provided
	if (!args.root) {
		if (data.root) {
			args.root = data.root;
		} else {
			//Config has no root either
			console.log("Root directory not specified ad command line or config.json");
			process.exit(1);
		}
	}
	if (typeof(args.workers) != typeof(0)) {
		//worker Argument not provided
		args.workers = numToCPU(data.workers);
	} else {
		//worker Argument provided
		args.workers = numToCPU(args.workers);
	}
	//No key specified and TLS is enabled in config.json
	if (!args.key && data.server.tls) {
		try {
			//Try to read configured key and cert files
			args.key = fs.readFileSync(data.server.key);
			args.cert = fs.readFileSync(data.server.cert);
		} catch (err) {
			console.error("TLS enabled in config.json but files unreadable:", err.message);
			exit(1);
		}
	}

	//Set ipcheck Parameters from config
	ipcheck.enabled = data.access.enabled;
	ipcheck.list = data.access.whitelist;
	ipcheck.maxage = data.access.maxage;

	//The master itself will not host a Web Server itself
	if (cluster.isMaster) {
		console.log("Simple HTTP Directory browser with range support | https://github.com/AyrA/dirbrowse");
		console.log("INFO: Root Directory:", args.root);

		//Warn user about potentially unsafe configuration
		if (!ipcheck.enabled) {
			console.log("WARN: IP restriction is disabled");
		}
		if (!args.key) {
			console.log("WARN: Using unencrypted HTTPS");
		}

		//Build URL the Server listens at.
		console.log("Starting Listener on http" + (args.key && args.cert ? "s" : "") + "://" + args.ip + ":" + args.port);
		//Show when a worker comes online
		cluster.on("online", function (worker) {
			//Report when a worker was started
			console.log("worker", worker.id, "started");
		});
		//Show when a worker exits
		cluster.on("exit", function (worker, code, signal) {
			//Treat non-zero code as unexpected exit and fire up new worker
			if (code !== 0) {
				console.error("worker", worker.id, "died without 'success' code. Signal:", signal);
				//Don't fire up worker immediately or bad things happen if he crashes instantly
				setTimeout(cluster.fork, 500);
			} else {
				console.log("Worker", worker.id, "stopped gracefully");
			}
		});

		console.log("starting", args.workers, "workers");
		// Fork workers
		for (var i = 0; i < args.workers; i++) {
			cluster.fork();
		}
	} else {
		try {
			//Try to apply TLS defaults
			if (!args.key && data.server.tls) {
				args.key = fs.readFileSync(data.server.key);
				args.cert = fs.readFileSync(data.server.cert);
			}

			var server;

			//check if HTTPS
			if (args.key && args.cert) {
				//Create HTTPS server
				server = https.createServer({
						key: args.key,
						cert: args.cert
					}, request);
			} else {
				//Create unencrypted HTTP server
				server = http.createServer(request);
				server.timeout = 0;
			}
			server.listen(args.port, args.ip).on("error", function (err) {
				console.error("Unable to start listener. Error:", err.message);
				process.exit(0);
			});
			server.timeout = 0;
		} catch (err) {
			console.error("Unable to start listener. Error:", err.message);
			process.exit(0);
		}
	}
});
//äöü <-- leave this please
