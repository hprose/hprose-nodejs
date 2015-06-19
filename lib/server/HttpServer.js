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
 * hprose/server/HttpServer.js                            *
 *                                                        *
 * Hprose Http Server for Node.js.                        *
 *                                                        *
 * LastModified: Jun 19, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var http = require('http');
var https = require('https');
var HttpService = global.hprose.HttpService;

function HttpServer(port, hostname, tlsOptions) {
    HttpService.call(this);

    var self = this;
    var server = (tlsOptions ?
        https.createServer(tlsOptions, self.handle) :
        http.createServer(self.handle));

    server.on('clientError', function (e) {
        var context = { server: server, userdata:{} };
        self.emit('sendError', e, context);
        if (self.onSendError) {
            self.onSendError(e, context);
        }
    });

    function start() {
        server.listen(port, hostname);
    }
    function stop() {
        server.close();
    }
    function listen() {
        server.listen.apply(server, arguments);
    }
    function close(callback) {
        server.close(callback);
    }

    Object.defineProperties(this, {
        server: { get: function () { return server; } },
        start: { value: start },
        stop: { value: stop },
        listen: { value: listen },
        close: { value: close }
    });
}

util.inherits(HttpServer, HttpService);

global.hprose.HttpServer = HttpServer;
