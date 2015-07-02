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
 * LastModified: Jul 2, 2015                              *
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

    function wsHandle(ws) {
        var context = {
            httpserver: self.httpserver,
            server: self.server,
            websocket: ws,
            userdata: {}
        }
        self.emit('accept',context);
        if (_onAccept) {
            _onAccept(context);
        }
        ws.on('close', function() {
            self.emit('close',context);
            if (_onClose) {
                _onClose(context);
            }
        });
        var bytes = new BytesIO();
        var dataLength = -1;
        ws.on('message', function(data) {
            var bytes = new BytesIO(data);
            var id = bytes.readByte() << 24 |
                     bytes.readByte() << 16 |
                     bytes.readByte() << 8  |
                     bytes.readByte();
            var request = bytes.read(bytes.length - 4);
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
            global.setTimeout(function() {
                var context = {
                    httpserver: self.httpserver,
                    server: self.server,
                    websocket: ws,
                    userdata: {}
                }
                var result = self.defaultHandle(request, context);
                if (Completer.isFuture(result)) {
                    result.then(sendData);
                }
                else {
                    sendData(result);
                }
            }, 0);
        });
        ws.on('error', function(e) {
            var context = {
                httpserver: self.httpserver,
                server: self.server,
                websocket: ws,
                userdata: {}
            };
            self.emit('sendError', e, context);
            if (self.onSendError) {
                self.onSendError(e, context);
            }
        });
    }
    Object.defineProperties(this, {
        onAccept: { get: getAccept, set: setAccept },
        onClose: { get: getClose, set: setClose },
        wsHandle: { value: wsHandle }
    });
}

util.inherits(WebSocketService, HttpService);

global.hprose.WebSocketService = WebSocketService;
