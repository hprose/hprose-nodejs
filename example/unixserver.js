/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');

function hello(name, context) {
    context.clients.push("news", "this is a pushed message: " + name);
    context.clients.broadcast("news", {x: 1, y: 2, message: "this is a pushed object:"  + name});
    return 'Hello ' + name + '!';
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
        console.log(hprose.BytesIO.toString(value));
        return value;
    };
    this.outputFilter = function(value) {
        console.log(hprose.BytesIO.toString(value));
        return value;
    };
}

var server = hprose.Server.create("unix:/tmp/my.sock");
server.debug = true;
server.filter = new LogFilter();
server.simple = true;
server.passContext = true;
server.addFunctions([hello, hello2, getMaps]);
server.addAsyncFunction(asyncHello);
server.publish('news');
server.on('sendError', function(message) {
    console.log(message);
});
process.on('SIGINT', function() {
  server.stop();
});
server.start();
