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
 * LastModified: Jun 20, 2015                             *
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
var Completer = global.hprose.Completer;

function noop(){}

function WebSocketClient(uri, functions) {
    if (this.constructor !== WebSocketClient) {
        return new WebSocketClient(uri, functions);
    }
    Client.call(this, uri, functions);
    this.timeout = 0;

    var _id = 0;
    var _completers = [];
    var _timeoutIds = [];
    var _requests = [];
    var _count = 0;
    var _ready = false;
    var ws = null;

    var self = this;

    function getNextId() {
        return (_id < 0x7fffffff) ? ++_id : _id = 0;
    }

    function send(id, request) {
        var bytes = new BytesIO();
        bytes.writeByte((id >> 24) & 0xff);
        bytes.writeByte((id >> 16) & 0xff);
        bytes.writeByte((id >> 8) & 0xff);
        bytes.writeByte(id & 0xff);
        if (request.constructor === String) {
            bytes.writeString(request);
        }
        else {
            bytes.write(request);
        }
        var completer = _completers[id];
        try {
            ws.send(bytes.bytes);
        }
        catch (e) {
            completer.completeError(e);
        }
    }
    function onopen() {
        _ready = true;
        if (_requests.length > 0) {
            for (var id in _requests) {
                send(id, _requests[id]);
            }
            _requests = [];
        }
    }
    function onmessage(data, flags) {
        var bytes = new BytesIO(data);
        var id = bytes.readByte() << 24 |
                 bytes.readByte() << 16 |
                 bytes.readByte() << 8  |
                 bytes.readByte();
        var timeoutId = _timeoutIds[id];
        var completer = _completers[id];
        delete _timeoutIds[id];
        delete _completers[id];
        --_count;
        if (timeoutId !== undefined) {
            global.clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        completer.complete(bytes.read(bytes.length - 4));
        if (_count === 0) {
            if (!self.keepAlive) close();
        }
    }
    function onclose(code, message) {
        ws = null;
    }
    function onerror(error) {
        self.onerror("WebSocket", error);
        self.emit('error', "WebSocket", error);
    }
    function connect() {
        _ready = false;
        self.setOption('perMessageDeflate', false);
        ws = new WebSocket(self.uri, self.options);
        ws.on('open', onopen);
        ws.on('message', onmessage);
        ws.on('error', onerror);
        ws.on('close', onclose);
    }
    function sendAndReceive(request) {
        if (ws === null ||
            ws.readyState === WebSocket.CLOSING ||
            ws.readyState === WebSocket.CLOSED) {
            connect();
        }
        ++_count;
        var id = getNextId();
        var completer = new Completer();
        var timeoutId;
        if (self.timeout > 0) {
            timeoutId = global.setTimeout(function() {
                delete _completers[id];
                delete _timeoutIds[id];
                delete _requests[id];
                --_count;
                ws.close();
                completer.completeError(new Error('timeout'));
            }, self.timeout);
        }
        _completers[id] = completer;
        _timeoutIds[id] = timeoutId;
        if (_ready) {
            send(id, request);
        }
        else {
            _requests[id] = request;
        }
        return completer.future;
    }
    function close() {
        ws.removeAllListeners('open');
        ws.removeAllListeners('message');
        ws.removeAllListeners('error');
        ws.removeAllListeners('close');
        ws.close();
    }
    Object.defineProperties(this, {
        sendAndReceive: { value: sendAndReceive },
        close: { value: close },
    });
}

function create(uri, functions) {
    var protocol = parse(uri).protocol;
    if (protocol === 'ws:' ||
        protocol === 'wss:') {
        return new WebSocketClient(uri, functions);
    }
    throw new Error('This client desn\'t support ' + protocol + ' scheme.');
}

Object.defineProperty(WebSocketClient, 'create', { value: create });

util.inherits(WebSocketClient, Client);

global.hprose.WebSocketClient = WebSocketClient;
