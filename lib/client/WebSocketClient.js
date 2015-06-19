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
 * LastModified: Jun 14, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var parse = require('url').parse;
var WebSocket = require('ws');

var Exception = global.hprose.Exception;
var Client = global.hprose.Client;
var BytesIO = global.hprose.BytesIO;
var Completer = global.hprose.Completer;

function noop(){}
var s_id = 0;
var s_completers = [];
var s_timeoutId = [];
var s_messages = [];
var s_count = 0;

function WebSocketClient(uri, functions) {
    if (this.constructor !== WebSocketClient) {
        return new WebSocketClient(uri, functions);
    }
    Client.call(this, uri, functions);
    this.timeout = 0;

    var _ready = false;
    var ws = null;

    var self = this;

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
        var completer = s_completers[id];
        try {
            ws.send(bytes.bytes);
        }
        catch (e) {
            completer.completeError(e);
        }
    }
    function onopen() {
        _ready = true;
        if (s_messages.length > 0) {
            for (var id in s_messages) {
                send(id, s_messages[id]);
            }
            s_messages = [];
        }
    }
    function onmessage(data, flags) {
        var bytes = new BytesIO(data);
        var id = bytes.readByte() << 24 |
                 bytes.readByte() << 16 |
                 bytes.readByte() << 8  |
                 bytes.readByte();
        var timeoutId = s_timeoutId[id];
        var completer = s_completers[id];
        delete s_timeoutId[id];
        delete s_completers[id];
        --s_count;
        if (timeoutId !== undefined) {
            global.clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        completer.complete(bytes.read(bytes.length - 4));
        if (s_count === 0) {
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
        ++s_count;
        var completer = new Completer();
        var timeoutId;
        if (self.timeout > 0) {
            timeoutId = global.setTimeout((function (id) {
                return function() {
                    delete s_completers[id];
                    delete s_timeoutId[id];
                    delete s_messages[id];
                    --s_count;
                    ws.close();
                    completer.completeError(new Exception('timeout'));
                };
            })(s_id), self.timeout);
        }
        s_completers[s_id] = completer;
        s_timeoutId[s_id] = timeoutId;
        if (_ready) {
            send(s_id, request);
        }
        else {
            s_messages[s_id] = request;
        }
        if (s_id < 0x7fffffff) {
            ++s_id;
        }
        else {
            s_id = 0;
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
    throw new Exception('This client desn\'t support ' + protocol + ' scheme.');
}

Object.defineProperty(WebSocketClient, 'create', { value: create });

util.inherits(WebSocketClient, Client);

global.hprose.WebSocketClient = WebSocketClient;
