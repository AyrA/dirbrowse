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
const getArguments = require("./lib/args.js");
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

//Command line arguments
var args = getArguments();

if (typeof(args) == typeof("")) {
	console.error("Error parsing command line arguments:", args);
	console.error("Use --help for more information");
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
	var readDone = function (e, x) {
		if (!e) {
			var text = "<a class='dir-link dir-up' href='..'>..</a><br />";
			for (var key in x) {
				if (x[key].isDirectory()) {
					text += "<a class='dir-link' href='" + encodeURIComponent(key) + "/'>" + key + "</a>";
				} else {
					text += "<a class='file-link' href='" + encodeURIComponent(key) + "'>" + key + "</a>";
				}
			}
			cb(null, pages.dir.replace(/\[ROOT\]/g, "/" + url).replace(/\[CLUSTER\]/g, cluster.worker.id).replace(/\[IP\]/g, ip).replace(/\[BODY\]/g, text));
		} else {
			cb(e, null);
		}
	}

	if (cache[directory] && Date.now() - cache[directory].age < 60000) {
		readDone(null, cache[directory].data);
	} else {
		console.log("Building cache for", directory);
		fs.readdir(directory, function (e, d) {
			if (!e) {
				cache[directory] = {
					data: {}
				};
				var data = d.concat([]);
				var proc = function () {
					if (data.length > 0) {
						var dir = data.shift();
						fs.lstat(path.join(directory, dir), function (e, x) {
							if (!e) {
								cache[directory].data[dir] = x;
							}
							proc();
						});
					} else {
						readDone(e, cache[directory].data);
					}
				};
				proc();
				cache[directory].age = Date.now();
			} else {
				readDone(e, null);
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

		fs.stat(urlpath, function (e, x) {
			if (!e) {
				//console.log("#" + cluster.worker.id, IP, decodeURIComponent(req.url));
				if (x.isDirectory()) {
					//Show Directory
					listDir(urlpath, requestdir, IP, function (e, x) {
						if (!e) {
							//Write Directory result
							res.writeHead(200, {
								"Content-Type": "text/html",
								Expires: expiration.dir
							});
							res.end(x);
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

//Checks if help was requested
function isHelp() {
	return (
		//Linux
		process.argv.indexOf("--help") >= 0 ||
		//Linux
		process.argv.indexOf("-h") >= 0 ||
		//Sometimes Windows
		process.argv.indexOf("-?") >= 0 ||
		//Windows
		process.argv.indexOf("/?") >= 0);
}

function numToCPU(x) {
	if (isNaN(x)) {
		//Safety override
		if ((x + "").substr(0, 1) === '!' && parseInt((x + "").substr(1)) > 0) {
			return parseInt((x + "").substr(1));
		} else {
			return null;
		}
	}
	//negative workers tell the system how many CPU cores *not* to use
	else if (x === 0) {
		return numCPUs;
	} else if (x < 0) {
		if (numCPUs + x < 1) {
			return null;
		} else {
			return numCPUs + x;
		}
	}
	return x;
}

////////////////////
//Startup sequence//
////////////////////

config.load(function (e, data) {

	if (e && !data) {
		console.error("Error loading config file:", e.message);
		process.exit(1);
	}
	if (e && data) {
		console.log("config.json not available. Saving defaults. Please edit");
		config.saveDefault();
	}
	if (!args.ip) {
		args.ip = data.server.ip;
		args.port = data.server.port;
	}
	if (!args.root) {
		if (data.root) {
			args.root = data.root;
		} else {
			console.log("Root directory not specified");
			process.exit(0);
		}
	}
	if (typeof(args.workers) != typeof(0)) {
		args.workers = numToCPU(data.workers);
	} else {
		args.workers = numToCPU(args.workers);
	}
	if (!args.key && data.server.tls) {
		try {
			args.key = fs.readFileSync(data.server.key);
			args.cert = fs.readFileSync(data.server.cert);
		} catch (e) {
			console.error("TLS enabled but files unreadable:", e.message);
			exit(1);
		}
	}

	ipcheck.enabled = data.access.enabled;
	ipcheck.list = data.access.whitelist;
	ipcheck.maxage = data.access.maxage;

	if (cluster.isMaster) {
		console.log("Simple HTTP Directory browser with range support");
		
		console.log("INFO: Root Directory:",args.root);
		
		if (!ipcheck.enabled) {
			console.log("WARN: IP restriction is disabled");
		}
		if (!args.key) {
			console.log("WARN: Using unencrypted HTTPS");
		}

		if (!isHelp()) {
			console.log("Starting Listener on http" + (args.key && args.cert ? "s" : "") + "://" + args.ip + ":" + args.port);
			//Show when a worker comes online
			cluster.on("online", function (worker) {
				console.log("worker", worker.id, "started");
			});
			//Show when a worker exits
			cluster.on("exit", function (worker, code, signal) {
				//Treat non-zero code as unexpected exit and restart worker
				if (code !== 0) {
					console.error("worker", worker.id, "died without 'success' code. Signal:", signal);
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
			console.error("Command line: " + path.basename(process.argv[0]) + " " + path.basename(process.argv[1]) + " [root] [-s IP:port] [-w procs] [-k key cert] [-d]");
			console.error([
					"root  - Root directory to list",
					"-s    - Serve from this local IP and port",
					"-w    - Number of worker processes",
					"-k    - Serve using TLS. First argument is private key, second argument is certificate",
					"-d    - Force file downloads. If not specified it is up to the browser to decide",
					"",
					"Any unspecified value defaults to what config.json defines",
					"config.json is created if it doesn't exists",
					"",
					"Workers",
					"=======",
					"Workers are specified as a number that is treated this way:",
					"Negative: This tells the system how many cores to not occupy",
					"0:        Use as many workers as there are CPU cores (default)",
					"Positive: Use this many workers. If you try to specify more than 4 times the CPU count, it will abort. To override, prefix the number with '!'",
					"",
					"About key security",
					"==================",
					"Be sure that the key is not accessible from a subdirectory of 'root' or a visitor could download it.",
					"If you run this as a service, an easy way to achieve it is to copy the key to a directory this instance can acces and after it is started, removing the key file again."]
				.join("\n"));
		}
	} else {
		try {
			if (!args.key && data.server.tls) {
				args.key = fs.readFileSync(data.server.key);
				args.cert = fs.readFileSync(data.server.cert);
			}

			//check if HTTPS
			if (args.key && args.cert) {
				https.createServer({
					key: args.key,
					cert: args.cert
				}, request).listen(args.port, args.ip).on("error", function (e) {
					console.error("Unable to start listener. Error:", e.message);
					process.exit(0);
				});
			} else {
				http.createServer(request).listen(args.port, args.ip).on("error", function (e) {
					console.error("Unable to start listener. Error:", e.message);
					process.exit(0);
				});
			}
		} catch (e) {
			console.error("Unable to start listener. Error:", e.message);
			process.exit(0);
		}
	}
});
//äöü <-- leave this please
