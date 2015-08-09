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
 * hprose/server/SocketServer.js                          *
 *                                                        *
 * Hprose Socket Server for Node.js.                      *
 *                                                        *
 * LastModified: Aug 9, 2015                              *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var net = require('net');
var tls = require('tls');
var SocketService = global.hprose.SocketService;

function SocketServer(options, tlsOptions) {
    SocketService.call(this);
    var self = this;
    var server = (tlsOptions ?
        tls.createServer(tlsOptions, self.handle) :
        net.createServer(self.handle));

    server.on('error', function (e) {
        var context = { server: server, userdata:{} };
        try {
            self.emit('sendError', e, context);
            if (self.onSendError) {
                self.onSendError(e, context);
            }
        }
        catch(e) {}
    });

    function start() {
        server.listen(options);
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

util.inherits(SocketServer, SocketService);

global.hprose.SocketServer = SocketServer;
global.hprose.TcpServer = SocketServer;
global.hprose.UnixServer = SocketServer;
