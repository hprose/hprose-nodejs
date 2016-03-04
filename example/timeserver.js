/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../lib/hprose');
var server = hprose.Server.create("http://0.0.0.0:8080");
server.publish('time');

function ClientListFilter() {
    this.inputFilter = function(value) {
        return value;
    };
    this.outputFilter = function(value, context) {
        console.log(context.clients.idlist('time'));
        return value;
    };
}

server.filter = new ClientListFilter();

setInterval(function() {
    server.push('time', new Date());
}, 1000);

process.on('SIGINT', function() {
    console.log("server is stoping!");
    server.stop();
    process.exit();
});

server.start();
