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
 * LastModified: Aug 14, 2015                             *
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
var TimeoutError = require('../common/TimeoutError');

var Client = global.hprose.Client;
var BytesIO = global.hprose.BytesIO;
var Future = global.hprose.Future;

function setReceiveEvent(conn) {
    var bytes = new BytesIO();
    var headerLength = 4;
    var dataLength = -1;
    var id = null;
    conn.on('data', function(chunk) {
        bytes.write(chunk);
        while (true) {
            if ((dataLength < 0) && (bytes.length >= headerLength)) {
                dataLength = bytes.readInt32BE();
                if ((dataLength & 0x80000000) !== 0) {
                    dataLength &= 0x7fffffff;
                    headerLength = 8;
                }
            }
            if ((headerLength === 8) && (id === null) && (bytes.length >= headerLength)) {
                id = bytes.readInt32BE();
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

function SocketTransporter(client) {
    if (client) {
        this.client = client;
        this.uri = this.client.uri;
        this.size = 0;
        this.pool = [];
        this.requests = [];
    }
}

Object.defineProperties(SocketTransporter.prototype, {
    create: { value: function() {
        var client = this.client;
        var parser = parse(this.uri);
        var protocol = parser.protocol;
        var socket;
        var options = {};
        for (var key in client.options) {
            options[key] = client.options[key];
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
        conn.setNoDelay(client.noDelay);
        conn.setKeepAlive(client.keepAlive);
        setReceiveEvent(conn);
        var self = this;
        conn.on('end', function() { conn.connected = false; });
        conn.on('close', function() { conn.connected = false; --self.size; });
        ++this.size;
        return conn;
    } }
});

function FullDuplexSocketTransporter(client) {
    SocketTransporter.call(this, client);
}

FullDuplexSocketTransporter.prototype = Object.create(
    SocketTransporter.prototype, {
    fetch: { value: function() {
        var pool = this.pool;
        while (pool.length > 0) {
            var conn = pool.shift();
            if (conn.connected) {
                if (conn.count === 0) {
                    conn.removeAllListeners('timeout');
                    conn.ref();
                }
                return conn;
            }
        }
        return null;
    } },
    init: { value: function(conn) {
        var self = this;
        conn.count = 0;
        conn.futures = {};
        conn.timeoutIds = {};
        conn.on('receive', function (data, id) {
            var future = conn.futures[id];
            if (future) {
                self.clean(conn, id);
                if (conn.count === 0) {
                    self.recycle(conn);
                }
                future.resolve(data);
            }
        });
        conn.on('error', function (e) {
            var futures = conn.futures;
            for (var id in futures) {
                var future = futures[id];
                self.clean(conn, id);
                future.reject(e);
            }
            conn.destroy();
        });
    } },
    recycle: { value: function(conn) {
        conn.unref();
        conn.setTimeout(this.client.poolTimeout, function() {
            conn.connected = false;
            conn.end();
        });
    } },
    clean: { value: function(conn, id) {
        if (conn.timeoutIds[id] !== undefined) {
            global.clearTimeout(conn.timeoutIds[id]);
            delete conn.timeoutIds[id];
        }
        delete conn.futures[id];
        --conn.count;
        this.sendNext(conn);
    } },
    sendNext: { value: function(conn) {
        if (conn.count < 10) {
            if (this.requests.length > 0) {
                var request = this.requests.shift();
                request.push(conn);
                this.send.apply(this, request);
            }
            else {
                this.pool.push(conn);
            }
        }
    } },
    send: { value: function(request, future, id, env, conn) {
        var self = this;

        var timeout = env.timeout;
        if (timeout > 0) {
            conn.timeoutIds[id] = global.setTimeout(function() {
                self.clean(conn, id);
                if (conn.count === 0) {
                    self.recycle(conn);
                }
                future.reject(new TimeoutError('timeout'));
            }, timeout);
        }
        conn.count++;
        conn.futures[id] = future;

        var len = request.length;
        var buf = new Buffer(8 + len);
        buf.writeInt32BE(len | 0x80000000, 0);
        buf.writeInt32BE(id, 4);
        for (var i = 0; i < len; i++) {
            buf[i + 8] = request[i];
        }
        conn.write(buf, function() {
            self.sendNext(conn);
        });
    } },
    getNextId: { value: function() {
        return (this.nextid < 0x7fffffff) ? ++this.nextid : this.nextid = 0;
    } },
    sendAndReceive: { value: function(request, future, env) {
        var conn = this.fetch();
        var id = this.getNextId();
        if (conn) {
            this.send(request, future, id, env, conn);
        }
        else if (this.size < this.client.maxPoolSize) {
            conn = this.create();
            conn.on('error', function(e) {
                conn.destroy();
                future.reject(e);
            });
            var self = this;
            conn.once('connect', function() {
                conn.removeAllListeners('error');
                conn.connected = true;
                self.init(conn);
                self.send(request, future, id, env, conn);
            });
        }
        else {
            this.requests.push([request, future, id, env]);
        }
    } }
});

FullDuplexSocketTransporter.prototype.constructor = SocketTransporter;

function HalfDuplexSocketTransporter(client) {
    SocketTransporter.call(this, client);
}

HalfDuplexSocketTransporter.prototype = Object.create(
    SocketTransporter.prototype, {
    fetch: { value: function() {
        var pool = this.pool;
        while (pool.length > 0) {
            var conn = pool.shift();
            if (conn.connected) {
                conn.removeAllListeners('timeout');
                conn.ref();
                return conn;
            }
        }
        return null;
    } },
    recycle: { value: function(conn) {
        conn.unref();
        conn.setTimeout(this.client.poolTimeout, function() {
            conn.connected = false;
            conn.end();
        });
        this.pool.push(conn);
    } },
    clean: { value: function(conn) {
        conn.removeAllListeners('receive');
        conn.removeAllListeners('error');
        if (conn.timeoutId !== undefined) {
            global.clearTimeout(conn.timeoutId);
            delete conn.timeoutId;
        }
    } },
    sendNext: { value: function(conn) {
        if (this.requests.length > 0) {
            var request = this.requests.shift();
            request.push(conn);
            this.send.apply(this, request);
        }
        else {
            this.recycle(conn);
        }
    } },
    send: { value: function(request, future, env, conn) {
        var self = this;
        var timeout = env.timeout;
        if (timeout > 0) {
            conn.timeoutId = global.setTimeout(function() {
                self.clean(conn);
                self.recycle(conn);
                future.reject(new TimeoutError('timeout'));
            }, timeout);
        }
        conn.on('receive', function(data) {
            self.clean(conn);
            self.sendNext(conn);
            future.resolve(data);
        });
        conn.on('error', function(e) {
            self.clean(conn);
            conn.destroy();
            future.reject(e);
        });

        var len = request.length;
        var buf = new Buffer(4 + len);
        buf.writeUInt32BE(len, 0);
        for (var i = 0; i < len; i++) {
            buf[i + 4] = request[i];
        }
        conn.write(buf);
    } },
    sendAndReceive: { value: function(request, future, env) {
        var conn = this.fetch();
        if (conn) {
            this.send(request, future, env, conn);
        }
        else if (this.size < this.client.maxPoolSize) {
            conn = this.create();
            var self = this;
            conn.on('error', function(e) {
                conn.destroy();
                future.reject(e);
            });
            conn.once('connect', function() {
                conn.removeAllListeners('error');
                conn.connected = true;
                self.send(request, future, env, conn);
            });
        }
        else {
            this.requests.push([request, future, env]);
        }
    } }
});

HalfDuplexSocketTransporter.prototype.constructor = SocketTransporter;

function SocketClient(uri, functions, settings) {
    if (this.constructor !== SocketClient) {
        return new SocketClient(uri, functions, settings);
    }
    Client.call(this, uri, functions, settings);

    var self = this;
    var _noDelay = true;
    var _fullDuplex = false;
    var _maxPoolSize = 10;
    var _poolTimeout = 30000;
    var fdtrans = null;
    var hdtrans = null;

    function getNoDelay() {
        return _noDelay;
    }

    function setNoDelay(value) {
        _noDelay = !!value;
    }

    function getFullDuplex() {
        return _fullDuplex;
    }

    function setFullDuplex(value) {
        _fullDuplex = !!value;
    }

    function getMaxPoolSize() {
        return _maxPoolSize;
    }

    function setMaxPoolSize(value) {
        if (typeof(value) === 'number') {
            _maxPoolSize = value | 0;
            if (_maxPoolSize < 1) {
                _maxPoolSize = 10;
            }
        }
        else {
            _maxPoolSize = 10;
        }
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

    function sendAndReceive(request, env) {
        var future = new Future();
        if (_fullDuplex) {
            if ((fdtrans === null) || (fdtrans.uri !== self.uri)) {
                fdtrans = new FullDuplexSocketTransporter(self);
            }
            fdtrans.sendAndReceive(request, future, env);
        }
        else {
            if ((hdtrans === null) || (hdtrans.uri !== self.uri)) {
                hdtrans = new HalfDuplexSocketTransporter(self);
            }
            hdtrans.sendAndReceive(request, future, env);
        }
        if (env.oneway) future.resolve();
        return future;
    }

    Object.defineProperties(this, {
        noDelay: { get: getNoDelay, set: setNoDelay },
        fullDuplex: { get: getFullDuplex, set: setFullDuplex },
        maxPoolSize: { get: getMaxPoolSize, set: setMaxPoolSize },
        poolTimeout: { get: getPoolTimeout, set: setPoolTimeout },
        sendAndReceive: { value: sendAndReceive }
    });
}

function checkuri(uri) {
    var protocol = parse(uri).protocol;
    if (protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:') {
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
    return new SocketClient(uri, functions, settings);
}

Object.defineProperty(SocketClient, 'create', { value: create });

util.inherits(SocketClient, Client);

global.hprose.SocketClient = SocketClient;
global.hprose.TcpClient = SocketClient;
global.hprose.UnixClient = SocketClient;
