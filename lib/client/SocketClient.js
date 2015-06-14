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
 * hprose/client/SocketClient.js                          *
 *                                                        *
 * Hprose Socket Client for Node.js.                      *
 *                                                        *
 * LastModified: Jun 14, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var net = require('net');
var tls = require('tls');
var parse = require('url').parse;

var Exception = global.hprose.Exception;
var Client = global.hprose.Client;
var BytesIO = global.hprose.BytesIO;
var Completer = global.hprose.Completer;

function SocketClient(uri, functions) {
    if (this.constructor !== SocketClient) {
        return new SocketClient(uri, functions);
    }
    Client.call(this, uri, functions);

    var _noDelay = true;
    var _connPool = [];
    var _olduri = uri;

    var self = this;

    function freeAllConnection() {
        for (var i in _connPool) {
            _connPool[i].end();
        }
        _connPool.length = 0;
    }

    function createConnection() {
        var parser = parse(self.uri);
        var protocol = parser.protocol;
        var socket;
        var options = {};
        for (var key in self.options) {
            options[key] = self.options[key];
        }
        if (protocol === 'tcp:' ||
            protocol === 'tcp4:' ||
            protocol === 'tcp6:') {
            socket = net;
            options.host = parser.hostname;
            options.port = parseInt(parser.port);
            if (protocol === 'tcp4:') {
                options.family = 4;
            }
            else if (protocol === 'tcp6:') {
                options.family = 6;
            }
        }
        else if (protocol === 'tcps:' ||
            protocol === 'tcp4s:' ||
            protocol === 'tcp6s:' ||
            protocol === 'tls:') {
            socket = tls;
            options.host = parser.hostname;
            options.port = parseInt(parser.port);
            if (protocol === 'tcp4s:') {
                options.family = 4;
            }
            else if (protocol === 'tcp6s:') {
                options.family = 6;
            }
        }
        else if (protocol === 'unix:') {
            socket = net;
            options.path = parser.path;
        }
        else {
            throw new Exception('Unsupported ' + protocol + ' protocol!');
        }
        var conn = socket.connect(options);
        conn.setNoDelay(_noDelay);
        conn.setKeepAlive(self.keepAlive);
        return conn;
    }

    function clearEvent(conn) {
        conn.removeAllListeners('data');
        conn.removeAllListeners('error');
        conn.removeAllListeners('timeout');
    }

    function send(conn, request) {
        var size = 4 + request.length;
        var buf = new Buffer(size);
        buf.writeUInt32BE(request.length, 0);
        for (var i = 4; i < size; i++) {
            buf[i] = request[i - 4];
        }
        conn.write(buf);
    }

    function sendAndReceive(request) {
        var completer = new Completer();
        if (_olduri !== self.uri) {
            freeAllConnection();
            _olduri = self.uri;
        }
        var conn;
        if (_connPool.length === 0) {
            conn = createConnection();
            conn.once('connect', function() {
                send(conn, request);
            });
        }
        else {
            conn = _connPool.pop();
            conn.ref();
            send(conn, request);
        }
        var bytes = new BytesIO();
        var dataLength = -1;
        conn.on('data', function(chunk) {
            bytes.write(chunk);
            if (dataLength < 0 && bytes.length >= 4) {
                var buf = bytes.toBuffer();
                var bufferLength = bytes.length;
                dataLength = buf.readUInt32BE(0);
                bytes = new BytesIO(buf.slice(4, bufferLength));
            }
            if (dataLength === bytes.length) {
                clearEvent(conn);
                conn.unref();
                _connPool.push(conn);
                completer.complete(bytes.bytes);
            }
        });
        conn.on('error', function(e) {
            clearEvent(conn);
            completer.completeError(e);
        });
        conn.setTimeout(self.timeout, function(e) {
            clearEvent(conn);
            conn.destroy();
            completer.completeError(e);
        });
        return completer.future;
    }

    function setNoDelay(value) {
        _noDelay = !!value;
    }

    function getNoDelay() {
        return _noDelay;
    }

    Object.defineProperties(this, {
        noDelay: { get: getNoDelay, set: setNoDelay },
        sendAndReceive: { value: sendAndReceive }
    });

}

function create(uri, functions) {
    var protocol = parse(uri).protocol;
    if (protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:') {
        return new SocketClient(uri, functions);
    }
    throw new Exception('This client desn\'t support ' + protocol + ' scheme.');
}

Object.defineProperty(SocketClient, 'create', { value: create });

util.inherits(SocketClient, Client);

global.hprose.SocketClient = SocketClient;
global.hprose.TcpClient = SocketClient;
global.hprose.UnixClient = SocketClient;
