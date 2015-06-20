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
 * hprose/server/Server.js                                *
 *                                                        *
 * Hprose Server for Node.js.                             *
 *                                                        *
 * LastModified: Jun 20, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var parse = require('url').parse;
var HttpServer = global.hprose.HttpServer;
var SocketServer = global.hprose.SocketServer;
var WebSocketServer = global.hprose.WebSocketServer;

function create(uri, tlsOptions) {
    var parser = parse(uri);
    var protocol = parser.protocol;
    var options = {};
    var port;
    if (protocol === 'http:' ||
        protocol === 'https:') {
        port = parseInt(parser.port);
        if (!port) {
            port = (protocol === 'http:' ? 80 : 443);
        }
        return new HttpServer(port, parser.hostname, tlsOptions);
    }
    if (protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:') {
        if (parser.hostname) {
            options.host = parser.hostname;
        }
        if (parser.port) {
            options.port = parseInt(parser.port);
        }
        return new SocketServer(options, tlsOptions);
    }
    if (protocol === 'unix:') {
        options.path = parser.path;
        return new SocketServer(options, tlsOptions);
    }
    if (protocol === 'ws:' ||
        protocol === 'wss:') {
        port = parseInt(parser.port);
        if (!port) {
            port = (protocol === 'http:' ? 80 : 443);
        }
        options.port = port;
        options.host = parser.hostname;
        if (parser.path) {
            options.path = parser.path;
        }
        return new WebSocketServer(options, tlsOptions);
    }
    throw new Error('The ' + protocol + ' server isn\'t implemented.');
}

function Server(uri, tlsOptions) {
    return create(uri, tlsOptions);
}

Object.defineProperty(Server, 'create', { value: create });

global.hprose.Server = Server;
