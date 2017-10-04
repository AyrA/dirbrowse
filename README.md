dirbrowse
=========

dirbrowse allows you to create a simple directory browser

Command Line
------------

	node dirbrowse.js [root] [-s IP:port] [-w procs] [-k key cert] [-d]
	root  - Root directory to list
	-s    - Serve from this local IP and port
	-w    - Number of worker processes
	-k    - Serve using TLS. First argument is private key, second argument is certificate
	-d    - Force file downloads. If not specified it is up to the browser to decide
	
	Any unspecified value defaults to what config.json defines
	config.json is created if it doesn't exists

This help can also be obtained by using the Argument `--help`, `-h`, `-?`, or `/?`

Features
--------

- **TLS**: Fully supports TLS
- **IP check**: IP check to limit access to the system
- **High performance**: Multiple processes and directory caching allow for high connection throughput
- **Configurable**: Application can be configured using `config.json` or command line
- **Multi Platform**: Works on Windows as well as Linux
- **Range Support**: Server supports range requests to provide streaming and download resume capability

TLS
---

To use TLS you need a key and a certificate in PEM format.
All links on pages delivered to the visitor are relative.
This allows dirbrowse to run behind a reverse proxy that does SSL offloading.

WARNING
=======

Whenever you share a directory make sure that no subdirectory contains files you don't want others to see.
For example ensure that the configured TLS certificate for HTTPS is not accessible.

IP check
--------

An IP Address File can be provided with Lines in this Format:

    {IP}/{Mask}\t{Comment}\t{Expiration}
	
	IP          - IP Address
	Mask        - Netmask. For single IP Addresses this is /23 for IPv4 and /128 for IPv6
	Comment     - Comment that describes the Entry.
	Expiration  - Unix Timestamp of Expiration. A Timestamp of 0 means it never expires

The comment is purely for the Administrator and is not evaluated by the script.
It should not contain tab characters or line breaks.
It can be an empty string.
A Localhost Line would look like `127.0.0.0/8\t\t0`.

**Note**: `\t` is a tab char (ASCII 0x09) and not the literal two chars `\t`

High performance
----------------

By Default it will spawn as many Processes as there are CPU Cores detected.
This can be changed via Command Line or `config.json`.

The Directory Listing is cached and Files in the `~` Directory are sent with long Expiration Headers.
With 8 Instances we were able to handle 500 parallel Directory requests without long wait Times.

Configurable
------------

A Configuration File (`config.json`) in this Format can be provided:

	{
		"access": {
			"enabled": false,
			"whitelist": "/path/to/whitelist.txt",
			"maxage": 60000
		},
		"server": {
			"tls": true,
			"key": "priv.key",
			"cert": "cert.crt",
			"ip":"127.0.0.1",
			"port":6375
		},
		"workers":0,
		"root":"/path/to/web/root"
	}

- **access.enabled**: Enable or disable IP access Check
- **access.whitelist**: File that contains the IP Address List
- **access.maxage**: Time in Milliseconds after which the Cache is reloaded
- **server.tls**: Enable or disable TLS
- **server.key**: File Name of Key File
- **server.cert**: File Name of Certificate File
- **server.ip**: IP Address to listen on
- **server.port**: Port to listen on
- **workers**: Number of Workers to create. `0`: Number of Cores, `>0`: This many Instances, `<0`: This many Cores to not occupy
- **root**: Root Directory to serve Files

The File is created if it doesn't exists. Command Line Arguments override `config.json`

Multi Platform
--------------

This App neither uses Windows nor Linux specific API Functions. It should run "as-is" on both Platforms.
Be aware that Windows doesn't likes `/` as Path Separator too much and Linux completely shits itself on `\`.
The Node internal File System Functions usually replace wrong separators with the correct ones.

Range Support
-------------

This Server supports Range Requests.
This allows for proper Media streaming in Browsers and for Resumption of interrupted Downloads.

Installation
------------

	npm install

Running
-------

	npm run server
	--OR--
	node dirbrowse.js

License
-------

MIT