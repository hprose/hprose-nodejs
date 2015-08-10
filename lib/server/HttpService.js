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
 * hprose/server/HttpService.js                           *
 *                                                        *
 * Hprose Http Service for Node.js.                       *
 *                                                        *
 * LastModified: Aug 10, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
'use strict';

var fs = require('fs');
var util = require('util');

var Service = global.hprose.Service;
var BytesIO = global.hprose.BytesIO;
var Future = global.hprose.Future;

function HttpService() {
    Service.call(this);

    var _onSendHeader = null;
    var _crossDomain = true;
    var _P3P = true;
    var _get = true;
    var _origins = {};
    var _origincount = 0;
    var _crossDomainXmlFile = null;
    var _crossDomainXmlContent = null;
    var _clientAccessPolicyXmlFile = null;
    var _clientAccessPolicyXmlContent = null;
    var _lastModified = (new Date()).toUTCString();
    var _etag = '"' + Math.floor(Math.random() * 2147483647).toString(16) +
                ':' + Math.floor(Math.random() * 2147483647).toString(16) + '"';

    var self = this;

    function getSendHeader() {
        return _onSendHeader;
    }

    function setSendHeader(value) {
        if (value === null || typeof value === 'function') {
            _onSendHeader = value;
        }
        else {
            throw new Error('onSendHeader must be a function or null.');
        }
    }

    function crossDomainXmlHandler(request, response) {
        if (request.url.toLowerCase() === '/crossdomain.xml') {
            if (request.headers['if-modified-since'] === _lastModified &&
                request.headers['if-none-match'] === _etag) {
                response.statusCode = 304;
            }
            else {
                response.setHeader('Last-Modified', _lastModified);
                response.setHeader('Etag', _etag);
                response.setHeader('Content-Type', 'text/xml');
                response.setHeader('Content-Length', _crossDomainXmlContent.length);
                response.write(_crossDomainXmlContent);
            }
            response.end();
            return true;
        }
        return false;
    }

    function clientAccessPolicyXmlHandler(request, response) {
        if (request.url.toLowerCase() === '/clientaccesspolicy.xml') {
            if (request.headers['if-modified-since'] === _lastModified &&
                request.headers['if-none-match'] === _etag) {
                response.statusCode = 304;
            }
            else {
                response.setHeader('Last-Modified', _lastModified);
                response.setHeader('Etag', _etag);
                response.setHeader('Content-Type', 'text/xml');
                response.setHeader('Content-Length', _clientAccessPolicyXmlContent.length);
                response.write(_clientAccessPolicyXmlContent);
            }
            response.end();
            return true;
        }
        return false;
    }

    function sendHeader(context) {
        var resp = context.response;
        resp.setHeader('Content-Type', 'text/plain');
        if (_P3P) {
            resp.setHeader('P3P',
                'CP="CAO DSP COR CUR ADM DEV TAI PSA PSD IVAi IVDi ' +
                'CONi TELo OTPi OUR DELi SAMi OTRi UNRi PUBi IND PHY ONL ' +
                'UNI PUR FIN COM NAV INT DEM CNT STA POL HEA PRE GOV"');
        }
        if (_crossDomain) {
            var origin = context.request.headers.origin;
            if (origin && origin !== 'null') {
                if (_origincount === 0 || _origins[origin]) {
                    resp.setHeader('Access-Control-Allow-Origin', origin);
                    resp.setHeader('Access-Control-Allow-Credentials', 'true');
                }
            }
            else {
                resp.setHeader('Access-Control-Allow-Origin', '*');
            }
        }
        self.emit('sendHeader', context);
        if (_onSendHeader !== null) {
            _onSendHeader(context);
        }
    }

    function isCrossDomainEnabled() {
        return _crossDomain;
    }

    function setCrossDomainEnabled(value) {
        _crossDomain = !!value;
    }

    function isP3PEnabled() {
        return _P3P;
    }

    function setP3PEnabled(value) {
        _P3P = !!value;
    }

    function isGetEnabled() {
        return _get;
    }

    function setGetEnabled(value) {
        _get = !!value;
    }

    function addAccessControlAllowOrigin(origin) {
        if (!_origins[origin]) {
            _origins[origin] = true;
            _origincount++;
        }
    }

    function removeAccessControlAllowOrigin(origin) {
        if (_origins[origin]) {
            delete _origins[origin];
            _origincount--;
        }
    }

    function getCrossDomainXmlFile() {
        return _crossDomainXmlFile;
    }

    function setCrossDomainXmlFile(value) {
        _crossDomainXmlFile = value;
        _crossDomainXmlContent = fs.readFileSync(_crossDomainXmlFile);
    }

    function getCrossDomainXmlContent() {
        return _crossDomainXmlContent;
    }

    function setCrossDomainXmlContent(value) {
        _crossDomainXmlFile = null;
        if (typeof(value) === 'string') value = new Buffer(value);
        _crossDomainXmlContent = value;
    }

    function getClientAccessPolicyXmlFile() {
        return _clientAccessPolicyXmlFile;
    }

    function setClientAccessPolicyXmlFile(value) {
        _clientAccessPolicyXmlFile = value;
        _clientAccessPolicyXmlContent = fs.readFileSync(_clientAccessPolicyXmlFile);
    }

    function getClientAccessPolicyXmlContent() {
        return _clientAccessPolicyXmlContent;
    }

    function setClientAccessPolicyXmlContent(value) {
        _clientAccessPolicyXmlFile = null;
        if (typeof(value) === 'string') value = new Buffer(value);
        _clientAccessPolicyXmlContent = value;
    }

    function _send(data, response) {
        data = BytesIO.toBuffer(data);
        response.setHeader('Content-Length', data.length);
        response.end(data);
    }

    function send(data, response) {
        if (Future.isFuture(data)) {
            data.then(function(data) { _send(data, response); });
        }
        else {
            _send(data, response);
        }
    }

    function handle(request, response) {
        var context = {
            server: self.server,
            request: request,
            response: response,
            socket: request.socket,
            userdata: {}
        };
        request.socket.setTimeout(self.timeout);
        var bytes = new BytesIO();
        request.on('data', function(data) { bytes.write(data); });
        request.on('end', function() {
            if (_clientAccessPolicyXmlContent !== null && clientAccessPolicyXmlHandler(request, response)) return;
            if (_crossDomainXmlContent !== null && crossDomainXmlHandler(request, response)) return;
            try {
                sendHeader(context);
            }
            catch (e) {
                send(self.endError(e, context), response);
                return;
            }
            var result = '';
            if ((request.method === 'GET') && _get) {
                result = self.doFunctionList(context);
            }
            else if (request.method === 'POST') {
                result = self.defaultHandle(bytes.bytes, context);
            }
            send(result, response);
        });
    }

    Object.defineProperties(this, {
        onSendHeader: { get: getSendHeader, set: setSendHeader },
        crossDomain: { get: isCrossDomainEnabled, set: setCrossDomainEnabled },
        p3p: { get: isP3PEnabled, set: setP3PEnabled },
        get: { get: isGetEnabled, set: isGetEnabled },
        crossDomainXmlFile: { get: getCrossDomainXmlFile, set: setCrossDomainXmlFile },
        crossDomainXmlContent: { get: getCrossDomainXmlContent, set: setCrossDomainXmlContent },
        clientAccessPolicyXmlFile: { get: getClientAccessPolicyXmlFile, set: getClientAccessPolicyXmlFile },
        clientAccessPolicyXmlContent: { get: getClientAccessPolicyXmlContent, set: getClientAccessPolicyXmlContent },
        addAccessControlAllowOrigin: { value: addAccessControlAllowOrigin },
        removeAccessControlAllowOrigin: { value: removeAccessControlAllowOrigin },
        handle: { value: handle }
    });
}

util.inherits(HttpService, Service);

global.hprose.HttpService = HttpService;
