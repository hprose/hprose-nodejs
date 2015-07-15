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
 * hprose.js                                              *
 *                                                        *
 * hprose for Node.js.                                    *
 *                                                        *
 * LastModified: Jun 22, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

global.hprose = global.hprose || Object.create(null);

require('./common/HarmonyMaps.js');
require('./common/setImmediate.js');
require('./common/Future.js');
require('./common/ResultMode.js');

require('./io/BytesIO.js');
require('./io/ClassManager.js');
require('./io/Tags.js');
require('./io/Writer.js');
require('./io/Reader.js');
require('./io/Formatter.js');

require('./client/Client.js');
require('./client/HttpClient.js');
require('./client/SocketClient.js');
require('./client/WebSocketClient.js');

require('./server/Service.js');
require('./server/HttpService.js');
require('./server/HttpServer.js');
require('./server/SocketService.js');
require('./server/SocketServer.js');
require('./server/WebSocketService.js');
require('./server/WebSocketServer.js');
require('./server/Server.js');

require('./filter/JSONRPCClientFilter.js');
require('./filter/JSONRPCServiceFilter.js');

global.HproseCompleter = global.hprose.Completer;
global.HproseFuture = global.hprose.Future;
global.HproseResultMode = global.hprose.ResultMode;

global.HproseBytesIO = global.hprose.BytesIO;
global.HproseClassManager = global.hprose.ClassManager;
global.HproseTags = global.hprose.Tags;
global.HproseWriter = global.hprose.Writer;
global.HproseRawReader = global.hprose.RawReader;
global.HproseReader = global.hprose.Reader;
global.HproseFormatter = global.hprose.Formatter;

global.HproseClient = global.hprose.Client;
global.HproseHttpClient = global.hprose.HttpClient;
global.HproseSocketClient = global.hprose.SocketClient;
global.HproseTcpClient = global.hprose.TcpClient;
global.HproseUnixClient = global.hprose.UnixClient;
global.HproseWebSocketClient = global.hprose.WebSocketClient;

global.HproseService = global.hprose.Service;
global.HproseServer = global.hprose.Server;
global.HproseHttpService = global.hprose.HttpService;
global.HproseHttpServer = global.hprose.HttpServer;
global.HproseSocketService = global.hprose.SocketService;
global.HproseSocketServer = global.hprose.SocketServer;
global.HproseTcpServer = global.hprose.TcpServer;
global.HproseUnixServer = global.hprose.UnixServer;
global.HproseWebSocketService = global.hprose.WebSocketService;
global.HproseWebSocketServer = global.hprose.WebSocketServer;

global.HproseJSONRPCClientFilter = global.hprose.JSONRPCClientFilter;
global.HproseJSONRPCServiceFilter = global.hprose.JSONRPCServiceFilter;

global.hprose.common = {
    Completer: global.hprose.Completer,
    Future: global.hprose.Future,
    ResultMode: global.hprose.ResultMode
};

global.hprose.io = {
    BytesIO: global.hprose.BytesIO,
    ClassManager: global.hprose.ClassManager,
    Tags: global.hprose.Tags,
    RawReader: global.hprose.RawReader,
    Reader: global.hprose.Reader,
    Writer: global.hprose.Writer,
    Formatter: global.hprose.Formatter
};

global.hprose.client = {
    Client: global.hprose.Client,
    HttpClient: global.hprose.HttpClient,
    SocketClient: global.hprose.SocketClient,
    TcpClient: global.hprose.TcpClient,
    UnixClient: global.hprose.UnixClient,
    WebSocketClient: global.hprose.WebSocketClient
};

global.hprose.server = {
    Service: global.hprose.Service,
    Server: global.hprose.Server,
    HttpService: global.hprose.HttpService,
    HttpServer: global.hprose.HttpServer,
    SocketService: global.hprose.SocketService,
    SocketServer: global.hprose.SocketServer,
    TcpServer: global.hprose.TcpServer,
    UnixServer: global.hprose.UnixServer,
    WebSocketService: global.hprose.WebSocketService,
    WebSocketServer: global.hprose.WebSocketServer
};

global.hprose.filter = {
    JSONRPCClientFilter: global.hprose.JSONRPCClientFilter,
    JSONRPCServiceFilter: global.hprose.JSONRPCServiceFilter
};

module.exports = global.hprose;
