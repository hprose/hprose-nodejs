/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('hprose');
var server = hprose.Server.create("http://0.0.0.0:8080");
server.publish('time');
setInterval(function() {
    server.push('time', new Date());
}, 1000);
process.on('SIGINT', function() {
  server.stop();
});
server.start();
