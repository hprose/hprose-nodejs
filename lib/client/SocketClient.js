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
 * LastModified: Jun 20, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var net = require('net');
var tls = require('tls');
var parse = require('url').parse;
var EventEmitter = require('events').EventEmitter;

var Client = global.hprose.Client;
var BytesIO = global.hprose.BytesIO;
var Completer = global.hprose.Completer;

function SocketClient(uri, functions) {
    if (this.constructor !== SocketClient) {
        return new SocketClient(uri, functions);
    }
    Client.call(this, uri, functions);

    var _noDelay = true;
    var _fullDuplex = false;
    var _hdPool = [];
    var _fdPool = [];
    var _poolTimeout = 30000;
    var _olduri = uri;

    var self = this;

    function receive(conn) {
        var bytes = new BytesIO();
        var headerLength = 4;
        var dataLength = -1;
        var id = null;
        conn.on('data', function(chunk) {
            bytes.write(chunk);
            while (true) {
                if ((dataLength < 0) && (bytes.length >= headerLength)) {
                    dataLength = bytes.readByte() << 24 |
                                 bytes.readByte() << 16 |
                                 bytes.readByte() << 8  |
                                 bytes.readByte();
                    if ((dataLength & 0x80000000) !== 0) {
                        dataLength &= 0x7fffffff;
                        headerLength = 8;
                    }
                }
                if ((headerLength === 8) && (id === null) && (bytes.length >= headerLength)) {
                    id = bytes.readByte() << 24 |
                         bytes.readByte() << 16 |
                         bytes.readByte() << 8  |
                         bytes.readByte();
                }
                if ((dataLength >= 0) && ((bytes.length - headerLength) >= dataLength)) {
                    conn.emit('receive', bytes.read(dataLength), id);
                    headerLength = 4;
                    id = null;
                    bytes.trunc();
                    dataLength = -1;
                }
                else {
                    break;
                }
            }
        });
    }

    function newConn() {
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
            throw new Error('Unsupported ' + protocol + ' protocol!');
        }
        var conn = socket.connect(options);
        conn.setNoDelay(_noDelay);
        conn.setKeepAlive(self.keepAlive);
        receive(conn);
        conn.on("end", function() { conn.connected = false; });
        conn.on("close", function() { conn.connected = false; });
        if (_fullDuplex) {
            conn.nextid = 0;
            conn.count = 0;
            conn.completers = {};
            conn.timeoutIds = {};
            conn.on('receive', function (data, id) {
                var completer = conn.completers[id];
                fdCleanConn(conn, id);
                if (conn.count === 0) {
                    fdRecycleConn(conn);
                }
                completer.complete(data);
            });
            conn.on('error', function (e) {
                for (var id in conn.completers) {
                    var completer = conn.completers[id];
                    fdCleanConn(conn, id);
                    conn.destroy();
                    completer.completeError(e);
                }
            });
        }
        return conn;
    }

    function sendAndReceive(request) {
        return _fullDuplex ?
            fdSendAndReceive(request) :
            hdSendAndReceive(request);
    }

    function fdFetchConn() {
        while (_fdPool.length > 0) {
            var conn = _fdPool.shift();
            if (conn.connected) {
                conn.removeAllListeners('timeout');
                if (conn.count === 0) {
                    conn.ref();
                }
                return conn;
            }
        }
        return null;
    }

    function fdRecycleConn(conn) {
        conn.unref();
        conn.setTimeout(_poolTimeout, function() {
            conn.connected = false;
            conn.end();
        });
    }

    function fdCleanConn(conn, id) {
        if (conn.timeoutIds[id] !== undefined) {
            global.clearTimeout(conn.timeoutIds[id]);
            delete conn.timeoutIds[id];
        }
        delete conn.completers[id];
        --conn.count;
    }

    function fdSend(conn, request, id) {
        var size = 8 + request.length;
        var buf = new Buffer(size);
        buf[0] = request.length >> 24 & 0xff | 0x80;
        buf[1] = request.length >> 16 & 0xff;
        buf[2] = request.length >> 8  & 0xff;
        buf[3] = request.length       & 0xff;
        buf[4] = id >> 24 & 0xff;
        buf[5] = id >> 16 & 0xff;
        buf[6] = id >> 8  & 0xff;
        buf[7] = id       & 0xff;
        for (var i = 8; i < size; i++) {
            buf[i] = request[i - 8];
        }
        conn.write(buf, function() {
            _fdPool.push(conn);
        });
    }

    function fdReceive(conn, id) {
        var completer = new Completer();
        var timeoutId;
        if (self.timeout > 0) {
            timeoutId = global.setTimeout(function() {
                fdCleanConn(conn, id);
                conn.destroy();
                completer.completeError(new Error("timeout"));
            }, self.timeout);
        }
        conn.count++;
        conn.completers[id] = completer;
        conn.timeoutIds[id] = timeoutId;
        return completer.future;
    }

    function getNextId(conn) {
        return (conn.nextid < 0x7fffffff) ? ++conn.nextid : conn.nextid = 0;
    }

    function fdSendAndReceive(request) {
        if (_olduri !== self.uri) {
            _fdPool = [];
            _olduri = self.uri;
        }
        var id;
        var conn = fdFetchConn();
        if (conn) {
            id = getNextId(conn);
            fdSend(conn, request, id);
        }
        else {
            conn = newConn();
            id = getNextId(conn);
            conn.once('connect', function() {
                conn.connected = true;
                fdSend(conn, request, id);
            });
        }
        return fdReceive(conn, id);
    }

    function hdFetchConn() {
        while (_hdPool.length > 0) {
            var conn = _hdPool.shift();
            if (conn.connected) {
                conn.removeAllListeners('timeout');
                conn.ref();
                return conn;
            }
        }
        return null;
    }

    function hdRecycleConn(conn) {
        conn.unref();
        conn.setTimeout(_poolTimeout, function() {
            conn.connected = false;
            conn.end();
        });
        _hdPool.push(conn);
    }

    function hdCleanConn(conn) {
        conn.removeAllListeners('receive');
        conn.removeAllListeners('error');
        if (conn.timeoutId !== undefined) {
            global.clearTimeout(conn.timeoutId);
            delete conn.timeoutId;
        }
    }

    function hdSend(conn, request) {
        var size = 4 + request.length;
        var buf = new Buffer(size);
        buf.writeUInt32BE(request.length, 0);
        for (var i = 4; i < size; i++) {
            buf[i] = request[i - 4];
        }
        conn.write(buf);
    }

    function hdReceive(conn, completer) {
        var completer = new Completer();
        if (self.timeout > 0) {
            conn.timeoutId = global.setTimeout(function() {
                hdCleanConn(conn);
                conn.end();
                completer.completeError(new Error("timeout"));
            }, self.timeout);
        }
        conn.on('receive', function(data) {
            hdCleanConn(conn);
            hdRecycleConn(conn);
            completer.complete(data);
        });
        conn.on('error', function(e) {
            hdCleanConn(conn);
            conn.destroy();
            completer.completeError(e);
        });
        return completer.future;
    }

    function hdSendAndReceive(request) {
        if (_olduri !== self.uri) {
            for (var i in _hdPool) {
                _hdPool[i].end();
            }
            _hdPool.length = 0;
            _olduri = self.uri;
        }
        var conn = hdFetchConn();
        if (conn) {
            hdSend(conn, request);
        }
        else {
            conn = newConn();
            conn.once('connect', function() {
                conn.connected = true;
                hdSend(conn, request);
            });
        }
        return hdReceive(conn);
    }

    function setNoDelay(value) {
        _noDelay = !!value;
    }

    function getNoDelay() {
        return _noDelay;
    }

    function setFullDuplex(value) {
        _fullDuplex = !!value;
    }

    function getFullDuplex() {
        return _fullDuplex;
    }

    function getPoolTimeout() {
        return _poolTimeout;
    }

    function setPoolTimeout(value) {
        if (typeof(value) === 'number') {
            _poolTimeout = value | 0;
        }
        else {
            _poolTimeout = 0;
        }
    }

    Object.defineProperties(this, {
        noDelay: { get: getNoDelay, set: setNoDelay },
        fullDuplex: { get: getFullDuplex, set: setFullDuplex },
        poolTimeout: { get: getPoolTimeout, set: setPoolTimeout },
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
    throw new Error('This client desn\'t support ' + protocol + ' scheme.');
}

Object.defineProperty(SocketClient, 'create', { value: create });

util.inherits(SocketClient, Client);

global.hprose.SocketClient = SocketClient;
global.hprose.TcpClient = SocketClient;
global.hprose.UnixClient = SocketClient;
