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

function setReceiveEvent(conn) {
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

function SocketTransporter(client) {
    if (client) {
        this.client = client;
        this.olduri = this.client.uri;
    }
}

SocketTransporter.prototype.create = function() {
    var client = this.client;
    var parser = parse(client.uri);
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
    conn.on("end", function() { conn.connected = false; });
    conn.on("close", function() { conn.connected = false; });
    return conn;
};

function FullDuplexSocketTransporter(client) {
    SocketTransporter.call(this, client);
    this.pool = [];
}

FullDuplexSocketTransporter.prototype = new SocketTransporter();

FullDuplexSocketTransporter.prototype.fetch = function() {
    var pool = this.pool;
    while (pool.length > 0) {
        var conn = pool.shift();
          if (conn.connected) {
            conn.removeAllListeners('timeout');
            if (conn.count === 0) {
                conn.ref();
            }
            return conn;
        }
    }
    return null;
};

FullDuplexSocketTransporter.prototype.init = function(conn) {
    var self = this;
    conn.nextid = 0;
    conn.count = 0;
    conn.completers = {};
    conn.timeoutIds = {};
    conn.on('receive', function (data, id) {
        var completer = conn.completers[id];
        self.clean(conn, id);
        if (conn.count === 0) {
            self.recycle(conn);
        }
        completer.complete(data);
    });
    conn.on('error', function (e) {
        var completers = conn.completers;
        for (var id in completers) {
            var completer = completers[id];
            self.clean(conn, id);
            conn.destroy();
            completer.completeError(e);
        }
    });
}

FullDuplexSocketTransporter.prototype.recycle = function(conn) {
    conn.unref();
    conn.setTimeout(this.client.poolTimeout, function() {
        conn.connected = false;
        conn.end();
    });
};

FullDuplexSocketTransporter.prototype.clean = function(conn, id) {
    if (conn.timeoutIds[id] !== undefined) {
        global.clearTimeout(conn.timeoutIds[id]);
        delete conn.timeoutIds[id];
    }
    delete conn.completers[id];
    --conn.count;
};

FullDuplexSocketTransporter.prototype.send = function(conn, request, id) {
    var len = request.length;
    var buf = new Buffer(8 + len);
    buf[0] = len >> 24 & 0xff | 0x80;
    buf[1] = len >> 16 & 0xff;
    buf[2] = len >> 8  & 0xff;
    buf[3] = len       & 0xff;
    buf[4] = id >> 24 & 0xff;
    buf[5] = id >> 16 & 0xff;
    buf[6] = id >> 8  & 0xff;
    buf[7] = id       & 0xff;
    for (var i = 0; i < len; i++) {
        buf[i + 8] = request[i];
    }
    var self = this;
    conn.write(buf, function() {
        self.pool.push(conn);
    });
}

FullDuplexSocketTransporter.prototype.receive = function(conn, id) {
    var completer = new Completer();
    var timeout = this.client.timeout;
    var timeoutId;
    if (timeout > 0) {
        var self = this;
        timeoutId = global.setTimeout(function() {
            self.clean(conn, id);
            conn.destroy();
            completer.completeError(new Error("timeout"));
        }, timeout);
    }
    conn.count++;
    conn.completers[id] = completer;
    conn.timeoutIds[id] = timeoutId;
    return completer.future;
};

FullDuplexSocketTransporter.prototype.getNextId = function(conn) {
    return (conn.nextid < 0x7fffffff) ? ++conn.nextid : conn.nextid = 0;
}

FullDuplexSocketTransporter.prototype.sendAndReceive = function(request) {
    if (this.olduri !== this.client.uri) {
        pool.length = 0;
        this.olduri = this.client.uri;
    }
    var conn = this.fetch();
    var id;
    if (conn) {
        id = this.getNextId(conn);
        this.send(conn, request);
    }
    else {
        conn = this.create();
        this.init(conn);
        id = this.getNextId(conn);
        var self = this;
        conn.once('connect', function() {
            conn.connected = true;
            self.send(conn, request, id);
        });
    }
    return this.receive(conn, id);
};

function HalfDuplexSocketTransporter(client) {
    SocketTransporter.call(this, client);
    this.pool = [];
}

HalfDuplexSocketTransporter.prototype = new SocketTransporter();

HalfDuplexSocketTransporter.prototype.fetch = function() {
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
};

HalfDuplexSocketTransporter.prototype.recycle = function(conn) {
    conn.unref();
    conn.setTimeout(this.client.poolTimeout, function() {
        conn.connected = false;
        conn.end();
    });
    this.pool.push(conn);
};

HalfDuplexSocketTransporter.prototype.clean = function(conn) {
    conn.removeAllListeners('receive');
    conn.removeAllListeners('error');
    if (conn.timeoutId !== undefined) {
        global.clearTimeout(conn.timeoutId);
        delete conn.timeoutId;
    }
};

HalfDuplexSocketTransporter.prototype.send = function(conn, request) {
    var len = request.length;
    var buf = new Buffer(4 + len);
    buf.writeUInt32BE(len, 0);
    for (var i = 0; i < len; i++) {
        buf[i + 4] = request[i];
    }
    conn.write(buf);
}

HalfDuplexSocketTransporter.prototype.receive = function(conn) {
    var completer = new Completer();
    var self = this;
    var timeout = this.client.timeout;
    if (timeout > 0) {
        conn.timeoutId = global.setTimeout(function() {
            self.clean(conn);
            conn.end();
            completer.completeError(new Error("timeout"));
        }, timeout);
    }
    conn.on('receive', function(data) {
        self.clean(conn);
        self.recycle(conn);
        completer.complete(data);
    });
    conn.on('error', function(e) {
        self.clean(conn);
        conn.destroy();
        completer.completeError(e);
    });
    return completer.future;
};

HalfDuplexSocketTransporter.prototype.sendAndReceive = function(request) {
    if (this.olduri !== this.client.uri) {
        for (var i in pool) {
            pool[i].end();
        }
        pool.length = 0;
        this.olduri = this.client.uri;
    }
    var conn = this.fetch();
    if (conn) {
        this.send(conn, request);
    }
    else {
        conn = this.create();
        var self = this;
        conn.once('connect', function() {
            conn.connected = true;
            self.send(conn, request);
        });
    }
    return this.receive(conn);
};

function SocketClient(uri, functions) {
    if (this.constructor !== SocketClient) {
        return new SocketClient(uri, functions);
    }
    Client.call(this, uri, functions);

    var _noDelay = true;
    var _fullDuplex = false;
    var _singleConn = false;
    var _poolTimeout = 30000;
    var fdtrans = new FullDuplexSocketTransporter(this);
    var hdtrans = new HalfDuplexSocketTransporter(this);

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

    function getSingleConn() {
        return _singleConn;
    }

    function setSingleConn(value) {
        _singleConn = !!value;
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

    function sendAndReceive(request) {
        return _fullDuplex ?
            fdtrans.sendAndReceive(request) :
            hdtrans.sendAndReceive(request);
    }

    Object.defineProperties(this, {
        noDelay: { get: getNoDelay, set: setNoDelay },
        fullDuplex: { get: getFullDuplex, set: setFullDuplex },
        singleConn: { get: getSingleConn, set: setSingleConn },
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
