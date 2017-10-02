//Filesystem
const fs = require("fs");
//IP Matching
const ipmatch = require("ip-range-check");

//One minute default age
exports.maxage = 60000;
exports.list = null;
exports.enabled = false;

//IP Address cache
var ipCache = {
	age: 0
};

//Reads an address entry from the address file
function parseAddr(v, i, a) {
	//Return invalid entry on empty lines
	if (v == "") {
		return ["0.0.0.0", "invalid", 0, false];
	}
	v = v.split('\t');
	//Line too long. Ignore rest
	if (v.length > 3) {
		v = v.slice(0, 3);
	}
	//Add Description where missing
	if (v.length < 2) {
		v.push("N/A");
	}
	//Add Duration where missing (assume forever)
	if (v.length < 3) {
		v.push(0);
	} else {
		//Replace unix timestamp with JS Timestamp
		v[2] = (v[2] == '0' ? 0x7FFFFFFF : +v[2]) * 1000;
	}
	//Set if still valid
	v[3] = v[2] >= Date.now();
	return v;
}

//Checks if an IP address has access permission
exports.canAccess = function (IP) {
	if (!exports.enabled) {
		return true;
	}
	//Reload cache if needed
	if (Date.now() - ipCache.age >= exports.maxage) {
		console.log("Reloading IP access cache");
		ipCache.list = fs.readFileSync(exports.list, "utf8")
			.split('\n')
			.map(parseAddr)
			.filter(function (v) {
				return v[3];
			});
		ipCache.age = Date.now();
	}
	//Check if Ip is in range
	return ipCache.list.filter(function (v) {
		return ipmatch(IP, v[0]);
	}).length > 0;
};
