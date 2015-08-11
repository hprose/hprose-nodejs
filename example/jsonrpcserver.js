/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');

function hello(name, context) {
    return 'Hello ' + name + '! -- ' + context.socket.remoteAddress;
}

function hello2(name) {
    return 'Hello ' + name + '!';
}

function asyncHello(name, callback) {
    callback('Hello ' + name + '!');
}

function getMaps() {
    var context = Array.prototype.pop.call(arguments);
    var result = {};
    var key;
    for (key in arguments) {
        result[key] = arguments[key];
    }
    return result;
}

function LogFilter() {
    this.inputFilter = function(value) {
        console.log("request: " + hprose.BytesIO.toString(value));
        return value;
    };
    this.outputFilter = function(value) {
        console.log("resonpse: " + hprose.BytesIO.toString(value));
        return value;
    };
}

var server = hprose.Server.create("http://0.0.0.0:8080");
server.crossDomain = true;
server.crossDomainXmlFile = './crossdomain.xml';
server.debug = true;
server.addFilter(new hprose.JSONRPCServiceFilter());
server.addFilter(new LogFilter());
server.simple = true;
server.passContext = true;
server.addFunctions([hello, hello2, getMaps]);
server.addAsyncFunction(asyncHello);
server.on('sendError', function(message) {
    console.error(message.stack);
});
process.on('SIGINT', function() {
  server.stop();
});
server.start();
