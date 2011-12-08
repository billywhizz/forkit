var TCP = process.binding("tcp_wrap").TCP;
var HTTPParser = process.binding("http_parser").HTTPParser;
try {
	var crypto = process.binding("crypto");
	var Connection = crypto.Connection;
	var SecureContext = crypto.SecureContext;
} catch (e) {
	throw new Error("node.js not compiled with openssl crypto support.");
}

var FreeList = function(name, max, constructor) {
	this.name = name;
	this.constructor = constructor;
	this.max = max;
	this.list = [];
};

FreeList.prototype.alloc = function() {
	return this.list.length ? this.list.shift() : this.constructor.apply(this, arguments);
};

FreeList.prototype.free = function(obj) {
  if (this.list.length < this.max) this.list.push(obj);
};

function noop() {};

function addHeaders(to, from) {
	var i = from.length;
	var j = 0;
	while(i) {
		var field = from[j++].toLowerCase();
		var value = from[j++];
		if(field in to) {
			to[field].push(value);
		}
		else {
			to[field] = [value];
		}
		i-=2;
	}
}

function createCredentials(key, cert, ciphers) {
	var c = new SecureContext();
	c.init();
	c.setKey(key);
	c.setCert(cert);
	if(ciphers) c.setCiphers(ciphers);
	c.addRootCerts();
	c.context = c;
	return c;
}

function Request() {
	this.headers = {};
	this.info = null;
}

function HTTPServer(options, handle) {
	var _server = this;
	var socket = handle?handle:new TCP();
	options.maxconn = options.maxconn || 1000;
	var HTTPParsers = new FreeList("HTTPParsers", options.maxconn, function() {
		var parser = new HTTPParser(HTTPParser.REQUEST);
		parser.onHeadersComplete = function(info) {
			var client = parser.client;
			var current = new Request();
			client.current = current;
			current.headers = {};
			current.info = info;
			info.server = client.getsockname();
			info.peer = client.getpeername();
			addHeaders(current.headers, info.headers);
			delete info.headers;
			client.onHeadersComplete.call(client, current);
		};
		parser.onMessageComplete = function() {
			var client = parser.client;
			client.onMessageComplete.call(client, client.current);
		};
		parser.onBody = function(buffer, start, len) {
			var client = parser.client;
			client.onBody.call(client, client.current, buffer, start, len);
		};
		return parser;
	});
	socket.onconnection = function(client) {
		var parser;
		var pair;
		if(!client) {
			if(_server.onError) _server.onError(new Error("Accept Failed: " + errno));
			return;
		}
		["onEnd", "onMessageComplete", "onHeadersComplete", "onConnect", "onError", "onBody"].forEach(function(foo) {
			client[foo] = options[foo]?options[foo]:noop;
		});
		function send(buff, encoding, cb) {
			if(encoding) {
				buff = new Buffer(buff, encoding);
			}
			var wr;
			if(options.secure) {
				wr = pair.cleartext.write(buff);
			}
			else {
				wr = client.write(buff);
			}
			if (!wr) {
				shutdown();
			}
			else {
				wr.oncomplete = cb;
			}
		}
		function shutdown() {
			try {
				client.readStop();
				client.onread = noop;
				var shutdownReq = client.shutdown();
				shutdownReq.oncomplete = function(status, handle, req) {
					parser.client = null;
					HTTPParsers.free(parser);
					client.onEnd.apply(client);
					handle.close();
				};
				return null;
			}
			catch(ex) {
				return ex;
			}
		}
		if(options.nodelay) client.setNoDelay();
		if(options.keepalive && options.keepalive.on) {
			client.setKeepAlive(true, options.keepalive.delay);
		}
		var parser = HTTPParsers.alloc();
		parser.reinitialize(HTTPParser.REQUEST);
		parser.client = client;
		client.destroy = shutdown;
		client.send = send;
		if(options.secure) {
			client.onread = function(buffer, offset, length) {
				if(!buffer) {
					shutdown();
				}
				else {
					var ret = pair.encrypted.write(buffer.slice(offset, offset + length));
				}
			};
			var serverCreds = createCredentials(options.credentials.key, options.credentials.cert, options.credentials.ciphers);
			pair = require("tls").createSecurePair(serverCreds, true);
			pair.on("secure", function() {
				client.onConnect.apply(client);
			});
			pair.encrypted.on("data", function(chunk) {
				var wr = client.write(chunk);
				wr.oncomplete = function(status, handle, req, buffer) {
				};
			});
			pair.cleartext.on("data", function(chunk) {
				try {
					var parsed = parser.execute(chunk, 0, chunk.length);
				}
				catch(ex) {
					if(options.onError) options.onError(ex);
					//shutdown();
				}
			});
		}
		else {
			client.onread = function(buffer, offset, length) {
				if(!buffer) {
					shutdown();
				}
				else {
					try {
						var parsed = parser.execute(buffer.slice(offset, offset + length), 0, length);
					}
					catch(ex) {
						if(options.onError) options.onError(ex);
						//shutdown();
					}
				}
			};
			client.onConnect.apply(client);
		}
		client.readStart();
	};
	_server.listen = function() {
		if(handle) {
			r = handle.listen(options.backlog || 128);
			return;
		}
		var r = socket.bind(options.host, options.port);
		if(r) {
			if(_server.onError) _server.onError(new Error("Bind Failed:" + errno));
			socket.close();
		}
		else {
			r = socket.listen(options.backlog || 128);
			if(r < 0) {
				if(_server.onError) _server.onError(new Error("Listen Failed: " + errno));
				socket.close();
			}
		}
	}
}
exports.Server = HTTPServer;