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
 * hprose/server/WebSocketService.js                      *
 *                                                        *
 * Hprose WebSocket Service for Node.js.                  *
 *                                                        *
 * LastModified: May 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');

var HttpService = global.hprose.HttpService;
var BytesIO = global.hprose.BytesIO;
var Completer = global.hprose.Completer;

function WebSocketService() {
    HttpService.call(this);

    var self = this;
    function wsHandle(ws) {
        var bytes = new BytesIO();
        var dataLength = -1;
        ws.on('message', function(data, flags) {
            var bytes = new BytesIO(data);
            var id = bytes.readByte() << 24;
            id = id | bytes.readByte() << 16;
            id = id | bytes.readByte() << 8;
            id = id | bytes.readByte();
            var request = bytes.read(bytes.length - 4);
            var result = self.defaultHandle(request, {
                httpserver: self.httpserver,
                server: self.server,
                websocket: ws,
                userdata: {}
            });
            function sendData(data) {
                var bytes = new BytesIO();
                bytes.writeByte((id >> 24) & 0xff);
                bytes.writeByte((id >> 16) & 0xff);
                bytes.writeByte((id >> 8) & 0xff);
                bytes.writeByte(id & 0xff);
                if (data.constructor === String) {
                    bytes.writeString(data);
                }
                else {
                    bytes.write(data);
                }
                ws.send(bytes.bytes, {
                    binary: true,
                    compress: false
                });
            }
            if (Completer.isFuture(result)) {
                result.then(sendData);
            }
            else {
                sendData(result);
            }
        });
        ws.on('error', function(e) {
            self.emit('sendError', e, {
                httpserver: self.httpserver,
                server: self.server,
                websocket: ws,
                userdata: {}
            });
        });
    }
    Object.defineProperties(this, {
        wsHandle: { value: wsHandle }
    });
}

util.inherits(WebSocketService, HttpService);

global.hprose.WebSocketService = WebSocketService;
