/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/
/**********************************************************\
 *                                                        *
 * hprose/client/WebSocketClient.js                       *
 *                                                        *
 * Hprose WebSocket Client for HTML5.                     *
 *                                                        *
 * LastModified: Aug 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var parse = require('url').parse;
var WebSocket = require('ws');

var Client = global.hprose.Client;
var BytesIO = global.hprose.BytesIO;
var Future = global.hprose.Future;
var TimeoutError = require('../common/TimeoutError');

function noop(){}

function WebSocketClient(uri, functions, settings) {
    if (this.constructor !== WebSocketClient) {
        return new WebSocketClient(uri, functions, settings);
    }
    Client.call(this, uri, functions, settings);

    var _id = 0;
    var _count = 0;
    var _reqcount = 0;
    var _futures = [];
    var _requests = [];
    var _ready = null;
    var ws = null;

    var self = this;

    function getNextId() {
        return (_id < 0x7fffffff) ? ++_id : _id = 0;
    }

    function send(id, request) {
        var bytes = new BytesIO();
        bytes.writeInt32BE(id);
        if (request.constructor === String) {
            bytes.writeString(request);
        }
        else {
            bytes.write(request);
        }
        var future = _futures[id];
        try {
            ws.send(bytes.bytes);
        }
        catch (e) {
            future.reject(e);
        }
    }
    function onopen() {
        _ready.resolve();
    }
    function onmessage(data, flags) {
        var bytes = new BytesIO(data);
        var id = bytes.readInt32BE();
        var future = _futures[id];
        delete _futures[id];
        if (future !== undefined) {
            --_count;
            future.resolve(bytes.read(bytes.length - 4));
        }
        if ((_count < 100) && (_requests.length > 0)) {
            ++_count;
            var request = _requests.shift();
            _ready.then(function() { send(request[0], request[1]); });
        }
        if (_count === 0) {
            if (!self.keepAlive) close();
        }
    }
    function onclose(code, message) {
        onerror(new Error(code + ':' + message));
        ws = null;
    }
    function onerror(error) {
        _futures.forEach(function(future, id) {
            future.reject(error);
            delete _futures[id];
        });
        _count = 0;
    }
    function connect() {
        _ready = new Future();
        self.setOption('perMessageDeflate', false);
        ws = new WebSocket(self.uri, self.options);
        ws.on('open', onopen);
        ws.on('message', onmessage);
        ws.on('error', onerror);
        ws.on('close', onclose);
    }
    function sendAndReceive(request, env) {
        if (ws === null ||
            ws.readyState === WebSocket.CLOSING ||
            ws.readyState === WebSocket.CLOSED) {
            connect();
        }
        var id = getNextId();
        var future = new Future();
        _futures[id] = future;
        if (env.timeout > 0) {
            future = future.timeout(env.timeout).catchError(function(e) {
                delete _futures[id];
                --_count;
                throw e;
            },
            function(e) {
                return e instanceof TimeoutError;
            });
        }
        if (_count < 100) {
            ++_count;
            _ready.then(function() { send(id, request); });
        }
        else {
            _requests.push([id, request]);
        }
        if (env.oneway) future.resolve();
        return future;
    }
    function close() {
        if (ws !== null) {
            ws.removeAllListeners('open');
            ws.removeAllListeners('message');
            ws.removeAllListeners('error');
            ws.removeAllListeners('close');
            ws.close();
        }
    }
    Object.defineProperties(this, {
        sendAndReceive: { value: sendAndReceive },
        close: { value: close },
    });
}

function checkuri(uri) {
    var protocol = parse(uri).protocol;
    if (protocol === 'ws:' ||
        protocol === 'wss:') {
        return;
    }
    throw new Error('This client desn\'t support ' + protocol + ' scheme.');
}

function create(uri, functions, settings) {
    if (typeof uri === 'string') {
        checkuri(uri);
    }
    else if (util.isArray(uri)) {
        uri.forEach(function(uri) { checkuri(uri); });
    }
    else {
        return new Error('You should set server uri first!');
    }
    return new WebSocketClient(uri, functions, settings);
}

Object.defineProperty(WebSocketClient, 'create', { value: create });

util.inherits(WebSocketClient, Client);

global.hprose.WebSocketClient = WebSocketClient;
