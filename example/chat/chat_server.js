/*jshint node:true, eqeqeq:true */
'use strict';

var hprose = require('../../lib/hprose.js');
var EventEmitter = require('events').EventEmitter;

function Chat() {}

var onlineChecker = new EventEmitter();

onlineChecker.on('subscribe', function(id, clients) {
    clients.push('message', id + ' is online.');
    clients.push('updateUsers', clients.idlist('message'));
});

onlineChecker.on('unsubscribe', function(id, clients) {
    clients.push('message', id + ' is offline.');
    clients.push('updateUsers', clients.idlist('message'));
});

Chat.prototype.getAllUsers = function(context) {
    return context.clients.idlist('message');
};

Chat.prototype.sendMessage = function(from, to, message, context) {
    context.clients.push('message', to, from + ' talk to me: ' + message);
    context.clients.push('message', from, 'I talk to ' + to + ': ' + message);
};

Chat.prototype.broadcast = function(from, message, context) {
    context.clients.push('message', from + ' said: ' + message);
};

// function LogFilter() {
//     this.inputFilter = function(value) {
//         console.log(hprose.BytesIO.toString(value));
//         return value;
//     };
//     this.outputFilter = function(value) {
//         console.log(hprose.BytesIO.toString(value));
//         return value;
//     };
// }

var server = hprose.Server.create("ws://0.0.0.0:8080");
server.debug = true;
server.passContext = true;
// server.filter = new LogFilter();
var chat = new Chat();
server.addMethod('getAllUsers', chat);
server.addMethods(['sendMessage', 'broadcast'], chat, { oneway: true });
server.publish('message', { events: onlineChecker });
server.publish('updateUsers');
// server.on('sendError', function(e) {
//     console.log(e.stack);
// });
server.start();
