require("../lib/forkit").Worker(function(err, handle, msg) {
	if(err) {
		process.exit(2);
	}
	//var logfile = require("fs").createWriteStream("./server." + process.pid + ".log");
	var HTTPServer = require("./http").Server;
	var bk = new Buffer("HTTP/1.1 200 OK\r\nConnection: Keep-Alive\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n\r\n");
	var b = new Buffer("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n\r\n");
	var s = new HTTPServer({
		onMessageComplete: function(req) {
			var socket = this;
			var tosend = b;
			if(req.info.shouldKeepAlive) tosend = bk;
			socket.send(tosend, null, function(status, handle, r, buffer) {
				if(status != 0 || !req.info.shouldKeepAlive) {
					socket.destroy();
				}
			});
		}
	}, handle);
	s.onError = function(err) {
		//if(logfile) logfile.write(err);
		process.exit(3);
	}
	s.listen();
});