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
 * LastModified: May 19, 2015                             *
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

    var self = this;
    function handle(conn) {
        function fdhandle(data, context, id) {
            function fdSendData(data) {
                var size = 8 + data.length;
                var buf = new Buffer(size);
                buf[0] = data.length >> 24 & 0xff | 0x80;
                buf[1] = data.length >> 16 & 0xff;
                buf[2] = data.length >> 8  & 0xff;
                buf[3] = data.length       & 0xff;
                buf[4] = id >> 24 & 0xff;
                buf[5] = id >> 16 & 0xff;
                buf[6] = id >> 8  & 0xff;
                buf[7] = id       & 0xff;
                for (var i = 8; i < size; i++) {
                    buf[i] = data[i - 8];
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
            var size = 4 + data.length;
            var buf = new Buffer(size);
            buf.writeUInt32BE(data.length, 0);
            for (var i = 4; i < size; i++) {
                buf[i] = data[i - 4];
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
        handle: { value: handle }
    });
}

util.inherits(SocketService, Service);

global.hprose.SocketService = SocketService;
