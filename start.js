var servers = [
	{
		type: "tcp",
		host: "0.0.0.0",
		port: 80,
		workers: 2,
		args: [process.cwd() + "/servers/test-http.js"],
		cwd: null,
		onstart: function(err, wp) {
			if(err) throw(err);
			console.log("start: " + wp.pid);
		},
		onexit: function(wp) {
			console.log("exit: " + wp.pid + ", code: " + wp.exitCode + ", signal: " + wp.signalCode);
			return true;
		},
		onerror: function(err) {
			console.log(err);
		}
	},
	{
		type: "tcp",
		host: "0.0.0.0",
		port: 81,
		workers: 2,
		args: [process.cwd() + "/servers/test-http.js"],
		cwd: null,
		onstart: function(err, wp) {
			if(err) throw(err);
			console.log("start: " + wp.pid);
		},
		onexit: function(wp) {
			console.log("exit: " + wp.pid + ", code: " + wp.exitCode + ", signal: " + wp.signalCode);
			return true;
		},
		onerror: function(err) {
			console.log(err);
		}
	}
];
servers.forEach(function(server) {
	require("./lib/forkit").Cluster(server).fork();
});