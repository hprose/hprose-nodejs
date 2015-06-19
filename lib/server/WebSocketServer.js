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
 * hprose/server/WebSocketServer.js                       *
 *                                                        *
 * Hprose WebSocket Server for Node.js.                   *
 *                                                        *
 * LastModified: Jun 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var ws = require('ws');
var http = require('http');
var https = require('https');
var WebSocketService = global.hprose.WebSocketService;

function WebSocketServer(options, tlsOptions) {
    WebSocketService.call(this);
    var self = this;
    var httpserver = http.createServer(self.handle);
    var host = options.host;
    var port = options.port;
    delete options.host;
    delete options.port;
    options.server = httpserver;
    options.perMessageDeflate = false;
    var server = null;

    function onerror(e) {
        var context = {
            httpserver: httpserver,
            server: self.server,
            userdata:{}
        };
        self.emit('sendError', e, context);
        if (self.onSendError) {
            self.onSendError(e, context);
        }
    }

    httpserver.on('clientError', onerror);

    function start() {
        httpserver.listen(port, host);
        server = new ws.Server(options);
        server.on('connection', self.wsHandle);
        server.on('error', onerror);
    }
    function stop() {
        server.close();
        httpserver.close();
    }
    function listen() {
        server.listen.apply(server, arguments);
        server = new ws.Server(options);
        server.on('connection', self.wsHandle);
        server.on('error', onerror);
    }
    function close(callback) {
        server.close();
        httpserver.close(callback);
    }

    Object.defineProperties(this, {
        httpserver: { get: function () { return httpserver; } },
        server: { get: function () { return server; } },
        start: { value: start },
        stop: { value: stop },
        listen: { value: listen },
        close: { value: close }
    });
}

util.inherits(WebSocketServer, WebSocketService);

global.hprose.WebSocketServer = WebSocketServer;
