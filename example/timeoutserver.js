/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');

function sum(a, b) {
    var promise = new hprose.Future();
    setTimeout(function() {
        promise.resolve(a + b);
    }, 1000);
    return promise;
}

var server = hprose.Server.create("tcp://0.0.0.0:4321");
server.addFunction(sum);
process.on('SIGINT', function() {
  server.stop();
});
server.start();
