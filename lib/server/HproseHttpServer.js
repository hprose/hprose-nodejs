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
 * HproseHttpServer.js                                    *
 *                                                        *
 * HproseHttpServer for Node.js.                          *
 *                                                        *
 * LastModified: Mar 19, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var http = require('http');
var HproseHttpService = require('./HproseHttpService.js');

function HproseHttpServer(port, hostname) {
    HproseHttpService.call(this);
    var server = http.createServer(this.handle.bind(this));
    this.start = function() {
        server.listen(port, hostname);
    };
    this.stop = function() {
        server.close();
    };
    this.listen = function(port, hostname, backlog, callback) {
        server.listen(port, hostname, backlog, callback);
    };
    this.close = function(callback) {
        server.close(callback);
    };
    server.on('clientError', function(exception) {
        this.emit('sendError', exception, server);
    }.bind(this));
}

util.inherits(HproseHttpServer, HproseHttpService);

module.exports = HproseHttpServer;