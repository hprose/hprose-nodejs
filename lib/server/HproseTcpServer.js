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
 * HproseTcpServer.js                                     *
 *                                                        *
 * HproseTcpServer for Node.js.                           *
 *                                                        *
 * LastModified: Oct 24, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var util = require('util');
var net = require('net');
var HproseTcpService = require('./HproseTcpService.js');

function HproseTcpServer(port, host) {
    HproseTcpService.call(this);
    var server = net.createServer(this.handle.bind(this));
    this.start = function() {
        server.listen(port, host);
    };
    this.stop = function() {
        server.close();
    };
    this.listen = function(port, host, backlog, callback) {
        server.listen(port, host, backlog, callback);
    };
    this.close = function(callback) {
        server.close(callback);
    };
    server.on('error', function(exception) {
        this.emit('sendError', exception, {userdata:{}, server: server});
    }.bind(this));
}

util.inherits(HproseTcpServer, HproseTcpService);

module.exports = HproseTcpServer;