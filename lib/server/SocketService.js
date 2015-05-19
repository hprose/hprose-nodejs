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
        var context = {
            server: self.server,
            conn: conn,
            userdata: {}
        };
        function sendData(data) {
            var size = 4 + data.length;
            var buf = new Buffer(size);
            buf.writeUInt32BE(data.length, 0);
            for (var i = 4; i < size; i++) {
                buf[i] = data[i - 4];
            }
            conn.write(buf);
        }
        conn.setTimeout(self.timeout);
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
                var result = self.defaultHandle(bytes.bytes, context);
                if (Completer.isFuture(result)) {
                    result.then(sendData);
                }
                else {
                    sendData(result);
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
