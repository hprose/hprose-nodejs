/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose.js');

function* hello(name) {
    return 'Hello ' + name + '!';
}

async function Asynchello(name) {
    return await new Promise((resolve, reject) => {
        resolve("AsyncHello " + name);
    });
}

var server = hprose.Server.create("http://0.0.0.0:8080");
server.crossDomain = true;
server.crossDomainXmlFile = './crossdomain.xml';
server.debug = true;
server.addFunction(hello);
server.addAsyncFunction(Asynchello);
server.on('sendError', function (message) {
    console.log(message.stack);
});
process.on('SIGINT', function () {
    server.stop();
});
server.start();
