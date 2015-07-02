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
 * LastModified: Jul 2, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');

var Service = global.hprose.Service;
var BytesIO = global.hprose.BytesIO;
var Completer = global.hprose.Completer;

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
            throw new Exception("onAccept must be a function or null.")
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
            throw new Exception("onClose must be a function or null.")
        }
    }

    function handle(conn) {
        var context = {
            server: self.server,
            conn: conn,
            userdata: {}
        };
        self.emit('accept',context);
        if (_onAccept) {
            _onAccept(context);
        }
        conn.on('close', function() {
            self.emit('close',context);
            if (_onClose) {
                _onClose(context);
            }
        });
        function fdhandle(data, context, id) {
            function fdSendData(data) {
                var len = data.length;
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
                    buf[i + 8] = data[i];
                }
                conn.write(buf);
            }
            global.setTimeout(function() {
                var result = self.defaultHandle(data, context);
                if (Completer.isFuture(result)) {
                    result.then(fdSendData);
                }
                else {
                    fdSendData(result);
                }
            }, 0);
        }
        function hdSendData(data) {
            var len = data.length;
            var buf = new Buffer(4 + len);
            buf.writeUInt32BE(len, 0);
            for (var i = 0; i < len; i++) {
                buf[i + 4] = data[i];
            }
            conn.write(buf);
        }
        function hdhandle(data, context) {
            global.setTimeout(function() {
                var result = self.defaultHandle(data, context);
                if (Completer.isFuture(result)) {
                    result.then(hdSendData);
                }
                else {
                    hdSendData(result);
                }
            }, 0);
        }
        conn.setTimeout(self.timeout);
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
                    var data = bytes.read(dataLength);
                    var context = {
                        server: self.server,
                        conn: conn,
                        userdata: {}
                    };
                    if (headerLength === 8) {
                        fdhandle(data, context, id);
                        headerLength = 4;
                        id = null;
                    }
                    else {
                        hdhandle(data, context);
                    }
                    bytes.trunc();
                    dataLength = -1;
                }
                else {
                    break;
                }
            }
        });
        conn.on('end', function(e) { });
        conn.on('error', function(e) { });
    }
    Object.defineProperties(this, {
        onAccept: { get: getAccept, set: setAccept },
        onClose: { get: getClose, set: setClose },
        handle: { value: handle }
    });
}

util.inherits(SocketService, Service);

global.hprose.SocketService = SocketService;
