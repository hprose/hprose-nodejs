/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var client = hprose.Client.create('http://www.hprose.com/example/', []);
function proxy(name, args) {
    return client.invoke(name, args, { mode: hprose.RawWithEndTag });
}
var server = hprose.Server.create("tcp://0.0.0.0:1234");
server.addMissingFunction(proxy, { mode: hprose.RawWithEndTag });
process.on('SIGINT', function() {
  server.stop();
});
server.start();
