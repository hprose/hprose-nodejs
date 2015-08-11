/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');

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

function onBeforeInvoke(name) {
    var completer = new hprose.Completer();
    if (name === "getUser") {
        completer.completeError(new Error(name));
    }
    else {
        completer.complete(null);
    }
    return completer.future;
}

var server = hprose.Server.create("http://0.0.0.0:8080");
server.crossDomain = true;
server.crossDomainXmlFile = './crossdomain.xml';
server.debug = true;
server.onBeforeInvoke = onBeforeInvoke;
server.add(function() {}, "getUser");
server.filter = new LogFilter();
//server.simple = true;
server.on('sendError', function(e) {
    console.log(e.stack);
});
process.on('SIGINT', function() {
  server.stop();
});
server.start();
