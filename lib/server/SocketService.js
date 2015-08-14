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
 * hprose/server/SocketService.js                         *
 *                                                        *
 * Hprose Socket Service for Node.js.                     *
 *                                                        *
 * LastModified: Aug 9, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');

var setImmediate = global.setImmediate;
var Service = global.hprose.Service;
var BytesIO = global.hprose.BytesIO;
var Future = global.hprose.Future;

function SocketService() {
    Service.call(this);

    var _onAccept = null;
    var _onClose = null;

    var self = this;

    function getAccept() {
        return _onAccept;
    }

    function setAccept(value) {
        if (value === null || typeof value === 'function') {
            _onAccept = value;
        }
        else {
            throw new Error('onAccept must be a function or null.');
        }
    }

    function getClose() {
        return _onClose;
    }

    function setClose(value) {
        if (value === null || typeof value === 'function') {
            _onClose = value;
        }
        else {
            throw new Error('onClose must be a function or null.');
        }
    }

    function _send(socket, data, id) {
        var p = (id === null ? 4 : 8);
        var n = data.length;
        var buf = new Buffer(p + n);
        if (p === 8) {
            buf.writeInt32BE(n | 0x80000000, 0);
            buf.writeInt32BE(id, 4);
        }
        else {
            buf.writeUInt32BE(n, 0);
        }
        for (var i = 0; i < n; i++) {
            buf[i + p] = data[i];
        }
        socket.write(buf);
    }

    function send(socket, data, id) {
        if (Future.isFuture(data)) {
            data.then(function(data) { _send(socket, data, id); });
        }
        else {
            _send(socket, data, id);
        }
    }

    function run(socket, data, id) {
        var context = {
            server: self.server,
            socket: socket,
            userdata: {}
        };
        data = self.defaultHandle(data, context);
        send(socket, data, id);
    }

    function receive(socket) {
        var bytes = new BytesIO();
        var headerLength = 4;
        var dataLength = -1;
        var id = null;
        socket.on('data', function(chunk) {
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
                    var data = bytes.read(dataLength);
                    run(socket, data, id);
                    bytes.trunc();
                    dataLength = -1;
                    headerLength = 4;
                    id = null;
                }
                else {
                    break;
                }
            }
        });
    }

    function handle(socket) {
        var context = {
            server: self.server,
            socket: socket,
            userdata: {}
        };
        try {
            self.emit('accept', context);
            if (_onAccept) _onAccept(context);
        }
        catch(e) {
            socket.end();
            return;
        }
        socket.on('close', function() {
            try {
                self.emit('close', context);
                if (_onClose) _onClose(context);
            }
            catch(e) {}
        });
        socket.on('end', function(e) { });
        socket.on('error', function(e) {
            try {
                self.emit('sendError', e, context);
                if (self.onSendError) {
                    self.onSendError(e, context);
                }
            }
            catch(e) {}
        });
        socket.setTimeout(self.timeout);
        receive(socket);
    }
    Object.defineProperties(this, {
        onAccept: { get: getAccept, set: setAccept },
        onClose: { get: getClose, set: setClose },
        handle: { value: handle }
    });
}

util.inherits(SocketService, Service);

global.hprose.SocketService = SocketService;
