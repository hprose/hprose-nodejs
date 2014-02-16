/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.net/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * HproseHttpServer.js                                    *
 *                                                        *
 * HproseHttpServer for Node.js.                          *
 *                                                        *
 * LastModified: Feb 17, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var http = require('http');
var HproseHttpService = require('./HproseHttpService.js');

function HproseHttpServer() {
    HproseHttpService.call(this);
    var server = http.createServer(this.handle.bind(this));
    this.listen = function(port, hostname, backlog, callback) {
        server.listen(port, hostname, backlog, callback);
    };
    this.close = function(callback) {
        server.close(callback);
    };
    server.on('clientError', function(exception) {
        this.emit('sendError', exception);
    }.bind(this));
}

util.inherits(HproseHttpServer, HproseHttpService);

module.exports = HproseHttpServer;