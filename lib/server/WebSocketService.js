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
 * LastModified: Aug 9, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');

var setImmediate = global.setImmediate;
var HttpService = global.hprose.HttpService;
var BytesIO = global.hprose.BytesIO;
var Future = global.hprose.Future;

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

    function _send(ws, data, id) {
        var bytes = new BytesIO();
        bytes.writeInt32BE(id);
        if (data.constructor === String) {
            bytes.writeString(data);
        }
        else {
            bytes.write(data);
        }
        try {
            ws.send(bytes.bytes, {
                binary: true,
                compress: false
            });
        }
        catch (e) {
            ws.emit('error', e);
        }
    }

    function send(ws, data, id) {
        if (Future.isFuture(data)) {
            data.then(function(data) { _send(ws, data, id); });
        }
        else {
            _send(ws, data, id);
        }
    }

    function wsHandle(ws) {
        var context = {
            httpserver: self.httpserver,
            server: self.server,
            websocket: ws,
            socket: ws._socket,
            userdata: {}
        };
        try {
            self.emit('accept', context);
            if (_onAccept) _onAccept(context);
        }
        catch(e) {
            ws.close();
            return;
        }
        ws.on('close', function() {
            try {
                self.emit('close',context);
                if (_onClose) _onClose(context);
            }
            catch(e) {}
        });
        var bytes = new BytesIO();
        var dataLength = -1;
        ws.on('error', function(e) {
            try {
                self.emit('sendError', e, context);
                if (self.onSendError) {
                    self.onSendError(e, context);
                }
            }
            catch(e) {}
        });
        ws.on('message', function(data) {
            var bytes = new BytesIO(data);
            var id = bytes.readInt32BE();
            var request = bytes.read(bytes.length - 4);
            setImmediate(function() {
                var context = {
                    httpserver: self.httpserver,
                    server: self.server,
                    websocket: ws,
                    socket: ws._socket,
                    userdata: {}
                };
                data = self.defaultHandle(request, context);
                send(ws, data, id);
            });
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
