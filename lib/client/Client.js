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
 * hprose/client/Client.js                                *
 *                                                        *
 * HproseClient for Node.js.                              *
 *                                                        *
 * LastModified: Jun 22, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint node:true, eqeqeq:true */
/*global Proxy */
'use strict';

var util = require('util');
var parse = require('url').parse;
var EventEmitter = require('events').EventEmitter;

var Tags = global.hprose.Tags;
var ResultMode = global.hprose.ResultMode;
var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;
var Completer = global.hprose.Completer;

var GETFUNCTIONS = new Uint8Array(1);
GETFUNCTIONS[0] = Tags.TagEnd;
function noop(){}

var s_boolean = 'boolean';
var s_string = 'string';
var s_number = 'number';
var s_function = 'function';
var s_OnError = '_OnError';
var s_onError = '_onError';
var s_onerror = '_onerror';
var s_Callback = '_Callback';
var s_callback = '_callback';
var s_OnSuccess = '_OnSuccess';
var s_onSuccess = '_onSuccess';
var s_onsuccess = '_onsuccess';

function HproseProxy(invoke, ns) {
    this.get = function(proxy, name) {
        if (ns) name = ns + '_' + name;
        return Proxy.createFunction(
            new HproseProxy(invoke, name),
            function () {
                var args = Array.prototype.slice.call(arguments);
                return invoke(this, name, args);
            }
        );
    };
}

function Client(uri, functions) {
    EventEmitter.call(this);

    // private members
    var _uri;
    var _ready              = false;
    var _byref              = false;
    var _simple             = false;
    var _useHarmonyMap      = false;
    var _onerror            = noop;
    var _filters            = [];
    var _batch              = false;
    var _batches            = [];
    var _completer          = new Completer();
    var _future             = _completer.future;
    var _timeout            = 30000;
    var _keepAlive          = true;
    var _options            = Object.create(null);

    var self = this;

    function sendAndReceive(request) {
        var completer = new Completer();
        var context = {client: self, userdata: {}};
        for (var i = 0, n = _filters.length; i < n; i++) {
            request = _filters[i].outputFilter(request, context);
        }
        self.sendAndReceive(request).then(
            function(response) {
                for (var i = _filters.length - 1; i >= 0; i--) {
                    response = _filters[i].inputFilter(response, context);
                }
                completer.complete(response);
            },
            function(error) {
                completer.completeError(error);
            }
        );
        return completer.future;
    }

    function initService(stub) {
        sendAndReceive(GETFUNCTIONS).then(
            function (data) {
                var error = null;
                try {
                    var stream = new BytesIO(data);
                    var reader = new Reader(stream, true);
                    var tag = stream.readByte();
                    switch (tag) {
                        case Tags.TagError:
                            error = new Error(reader.readString());
                            break;
                        case Tags.TagFunctions:
                            var functions = reader.readList();
                            reader.checkTag(Tags.TagEnd);
                            setFunctions(stub, functions);
                            break;
                        default:
                            error = new Error('Wrong Response:\r\n' + BytesIO.toString(data));
                            break;
                    }
                }
                catch (e) {
                    error = e;
                }
                if (error !== null) {
                    _completer.completeError(error);
                }
                else {
                    _completer.complete(stub);
                }
            },
            function(error) {
                _completer.completeError(error);
            }
        );
    }

    function setFunction(stub, func) {
        return function () {
            return _invoke(stub, func, arguments);
        };
    }

    function setMethods(stub, obj, namespace, name, methods) {
        if (obj[name] !== undefined) return;
        obj[name] = {};
        if (typeof(methods) === s_string || methods.constructor === Object) {
            methods = [methods];
        }
        if (Array.isArray(methods)) {
            for (var i = 0; i < methods.length; i++) {
                var m = methods[i];
                if (typeof(m) === s_string) {
                    obj[name][m] = setFunction(stub, namespace + name + '_' + m);
                }
                else {
                    for (var n in m) {
                        setMethods(stub, obj[name], name + '_', n, m[n]);
                    }
                }
            }
        }
    }

    function setFunctions(stub, functions) {
        for (var i = 0; i < functions.length; i++) {
            var f = functions[i];
            if (typeof(f) === s_string) {
                if (stub[f] === undefined) {
                    stub[f] = setFunction(stub, f);
                }
            }
            else {
                for (var name in f) {
                    setMethods(stub, stub, '', name, f[name]);
                }
            }
        }
        _ready = true;
    }

    function copyargs(src, dest) {
        var n = Math.min(src.length, dest.length);
        for (var i = 0; i < n; ++i) dest[i] = src[i];
    }

    function _invoke(stub, func, args) {
        var completer = new Completer();
        var resultMode = ResultMode.Normal, stream;
        if (!_batch && !_batches.length || _batch) {
            var byref = _byref;
            var simple = _simple;
            var lowerCaseFunc = func.toLowerCase();
            var errorHandler = stub[func + s_OnError] ||
                               stub[func + s_onError] ||
                               stub[func + s_onerror] ||
                               stub[lowerCaseFunc + s_OnError] ||
                               stub[lowerCaseFunc + s_onError] ||
                               stub[lowerCaseFunc + s_onerror] ||
                               self[func + s_OnError] ||
                               self[func + s_onError] ||
                               self[func + s_onerror] ||
                               self[lowerCaseFunc + s_OnError] ||
                               self[lowerCaseFunc + s_onError] ||
                               self[lowerCaseFunc + s_onerror];
            var callback = stub[func + s_Callback] ||
                           stub[func + s_callback] ||
                           stub[func + s_OnSuccess] ||
                           stub[func + s_onSuccess] ||
                           stub[func + s_onsuccess] ||
                           stub[lowerCaseFunc + s_Callback] ||
                           stub[lowerCaseFunc + s_callback] ||
                           stub[lowerCaseFunc + s_OnSuccess] ||
                           stub[lowerCaseFunc + s_onSuccess] ||
                           stub[lowerCaseFunc + s_onsuccess] ||
                           self[func + s_Callback] ||
                           self[func + s_callback] ||
                           self[func + s_OnSuccess] ||
                           self[func + s_onSuccess] ||
                           self[func + s_onsuccess] ||
                           self[lowerCaseFunc + s_Callback] ||
                           self[lowerCaseFunc + s_callback] ||
                           self[lowerCaseFunc + s_OnSuccess] ||
                           self[lowerCaseFunc + s_onSuccess] ||
                           self[lowerCaseFunc + s_onsuccess];
            var count = args.length;
            var tArg5 = typeof(args[count - 5]);
            var tArg4 = typeof(args[count - 4]);
            var tArg3 = typeof(args[count - 3]);
            var tArg2 = typeof(args[count - 2]);
            var tArg1 = typeof(args[count - 1]);
            if (tArg1 === s_boolean &&
                tArg2 === s_number &&
                tArg3 === s_boolean &&
                tArg4 === s_function &&
                tArg5 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                byref = args[count - 3];
                errorHandler = args[count - 4];
                callback = args[count - 5];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                delete args[count - 5];
                args.length -= 5;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                resultMode = args[count - 1];
                byref = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                byref = args[count - 2];
                errorHandler = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_function &&
                     tArg3 === s_function) {
                byref = args[count - 1];
                errorHandler = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_function &&
                     tArg3 === s_function) {
                resultMode = args[count - 1];
                errorHandler = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_function &&
                     tArg2 === s_function) {
                errorHandler = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_boolean &&
                     tArg4 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                byref = args[count - 3];
                callback = args[count - 4];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                delete args[count - 4];
                args.length -= 4;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_number &&
                     tArg3 === s_function) {
                simple = args[count - 1];
                resultMode = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function) {
                resultMode = args[count - 1];
                byref = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_boolean &&
                     tArg3 === s_function) {
                simple = args[count - 1];
                byref = args[count - 2];
                callback = args[count - 3];
                delete args[count - 1];
                delete args[count - 2];
                delete args[count - 3];
                args.length -= 3;
            }
            else if (tArg1 === s_boolean &&
                     tArg2 === s_function) {
                byref = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_number &&
                     tArg2 === s_function) {
                resultMode = args[count - 1];
                callback = args[count - 2];
                delete args[count - 1];
                delete args[count - 2];
                args.length -= 2;
            }
            else if (tArg1 === s_function) {
                callback = args[count - 1];
                delete args[count - 1];
                args.length--;
            }
            if (_batch) {
                if (resultMode === ResultMode.RawWithEndTag) {
                    throw new Error("ResultMode.RawWithEndTag doesn't support in batch mode.");
                }
                else if (resultMode === ResultMode.Raw) {
                    throw new Error("ResultMode.Raw doesn't support in batch mode.");
                }
            }
            stream = new BytesIO();
            stream.writeByte(Tags.TagCall);
            var writer = new Writer(stream, simple);
            writer.writeString(func);
            if (args.length > 0 || byref) {
                writer.reset();
                writer.writeList(args);
                if (byref) {
                    writer.writeBoolean(true);
                }
            }

            if (_batch) {
                _batches.push({args: args,
                               func: func,
                               data: stream.bytes,
                               resultMode: resultMode,
                               callback: callback,
                               errorHandler: errorHandler,
                               completer: completer});
            }
            else {
                stream.writeByte(Tags.TagEnd);
            }
        }

        if (!_batch) {
            var batchSize = _batches.length;
            var batch = !!batchSize;
            var request = new BytesIO();
            if (batch) {
                for (var i = 0; i < batchSize; ++i) {
                    request.write(_batches[i].data);
                    delete _batches[i].data;
                }
                request.writeByte(Tags.TagEnd);
            }
            else {
                request = stream;
            }

            var batches = _batches.slice(0);
            _batches.length = 0;

            sendAndReceive(request.bytes).then(
                function (response) {
                    var result = null;
                    var error = null;
                    var i;
                    if (resultMode === ResultMode.RawWithEndTag) {
                        result = response;
                    }
                    else if (resultMode === ResultMode.Raw) {
                        result = response.subarray(0, response.byteLength - 1);
                    }
                    else {
                        var stream = new BytesIO(response);
                        var reader = new Reader(stream, false, _useHarmonyMap);
                        var tag;
                        i = -1;
                        try {
                            while ((tag = stream.readByte()) !== Tags.TagEnd) {
                                switch (tag) {
                                case Tags.TagResult:
                                    if (batch) {
                                        resultMode = batches[i+1].resultMode;
                                    }
                                    if (resultMode === ResultMode.Serialized) {
                                        result = reader.readRaw();
                                    }
                                    else {
                                        reader.reset();
                                        result = reader.unserialize();
                                    }
                                    if (batch) {
                                        batches[++i].result = result;
                                        batches[i].error = null;
                                    }
                                    break;
                                case Tags.TagArgument:
                                    reader.reset();
                                    var _args = reader.readList();
                                    if (batch) {
                                        copyargs(_args, batches[i].args);
                                    }
                                    else {
                                        copyargs(_args, args);
                                    }
                                    break;
                                case Tags.TagError:
                                    reader.reset();
                                    error = new Error(reader.readString());
                                    if (batch) {
                                        batches[++i].error = error;
                                    }
                                    break;
                                default:
                                    error = new Error('Wrong Response:\r\n' + BytesIO.toString(response));
                                    if (batch) {
                                        batches[++i].error = error;
                                    }
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            error = e;
                            if (batch) {
                                batches[i < 0 ? 0 : i >= batchSize ? i - 1 : i].error = error;
                            }
                        }
                    }

                    if (!batch) {
                        batchSize  = 1;
                        batches = [{args: args,
                                    func: func,
                                    callback: callback,
                                    errorHandler: errorHandler,
                                    result: result,
                                    error: error,
                                    completer: completer}];
                    }
                    for (i = 0; i < batchSize; ++i) {
                        var item = batches[i];
                        if (item.error) {
                            item.completer.completeError(item.error);
                            if (item.errorHandler) {
                                item.errorHandler(item.func, item.error);
                            }
                            else {
                                _onerror(item.func, item.error);
                                self.emit('error', item.func, item.error);
                            }
                        }
                        else {
                            item.completer.complete(item.result);
                            if (item.callback) {
                                item.callback(item.result, item.args);
                            }
                        }
                    }
                },
                function(error) {
                    completer.completeError(error);
                    if (errorHandler) {
                        errorHandler(func, error);
                    }
                    else {
                        _onerror(func, error);
                        self.emit('error', func, error);
                    }
                }
            );
        }
        return completer.future;
    }

    // public methods
    function getOnError() {
        return _onerror;
    }
    function setOnError(value) {
        if (typeof(value) === s_function) {
            _onerror = value;
        }
    }
    function getReady() {
        return _ready;
    }
    function getUri() {
        return _uri;
    }
    function getTimeout() {
        return _timeout;
    }
    function setTimeout(value) {
        if (typeof(value) === 'number') {
            _timeout = value | 0;
        }
        else {
            _timeout = 0;
        }
    }
    function setKeepAlive(value) {
        _keepAlive = !!value;
    }
    function getKeepAlive() {
        return _keepAlive;
    }
    function getByRef() {
        return _byref;
    }
    function setByRef(value) {
        _byref = !!value;
    }
    function getSimpleMode() {
        return _simple;
    }
    function setSimpleMode(value) {
        _simple = !!value;
    }
    function getUseHarmonyMap() {
        return _useHarmonyMap;
    }
    function setUseHarmonyMap(value) {
        _useHarmonyMap = !!value;
    }
    function setOption(option, value) {
        _options[option] = value;
    }
    function getOptions() {
        return _options;
    }
    function getFilter() {
        if (_filters.length === 0) {
            return null;
        }
        return _filters[0];
    }
    function setFilter(filter) {
        _filters.length = 0;
        if (filter &&
            typeof filter.inputFilter === 'function' &&
            typeof filter.outputFilter === 'function') {
            _filters.push(filter);
        }
    }
    function addFilter(filter) {
        if (filter &&
            typeof filter.inputFilter === 'function' &&
            typeof filter.outputFilter === 'function') {
            _filters.push(filter);
        }
    }
    function removeFilter(filter) {
        var i = _filters.indexOf(filter);
        if (i === -1) {
            return false;
        }
        _filters.splice(i, 1);
        return true;
    }
    function useService(uri, functions, create) {
        if (create === undefined) {
            if (typeof(functions) === s_boolean) {
                create = functions;
                functions = false;
            }
            if (!functions) {
                if (typeof(uri) === s_boolean) {
                    create = uri;
                    uri = false;
                }
                else if (uri && uri.constructor === Object ||
                         Array.isArray(uri)) {
                    functions = uri;
                    uri = false;
                }
            }
        }
        var stub = self;
        if (create) {
            stub = {};
        }
        _ready = false;
        if (!uri && !_uri) {
            return new Error('You should set server uri first!');
        }
        if (uri) {
            _uri = uri;
        }
        if (typeof(functions) === s_string ||
            (functions && functions.constructor === Object)) {
            functions = [functions];
        }
        if (Array.isArray(functions)) {
            setFunctions(stub, functions);
        }
        else {
            if (typeof(Proxy) !== 'undefined') {
                _ready = true;
                return Proxy.create(new HproseProxy(_invoke));
            }
            else {
                global.setTimeout(function () { initService(stub); }, 0);
                return _future;
            }
        }
        return stub;
    }
    function invoke() {
        var args = arguments;
        var func = Array.prototype.shift.apply(args);
        var hasCallback = false;
        var i;
        for (i in args) {
            if (typeof(args[i]) === s_function) {
                hasCallback = true;
                break;
            }
        }
        if (!hasCallback && (args.length > 0) && Array.isArray(args[0])) {
            var _args = args[0];
            _args.push(function(result, args) {});
            var n = args.length;
            for (i = 1; i < n; i++) {
                _args.push(args[i]);
            }
            args = _args;
        }
        return _invoke(self, func, args);
    }
    function beginBatch() {
        if(!_batch) {
            _batch = true;
        }
    }
    function endBatch() {
        _batch = false;
        if (_batches.length) {
            _invoke();
        }
    }
    var then = function(onComplete, onError) {
        return _future.then(onComplete, onError);
    };
    function getThen() {
        var _then = then;
        then = null;
        return _then;
    }
    function catchError(onError) {
        return _future.catchError(onError);
    }

    /* function constructor */ {
        if (typeof(uri) === s_string) {
            useService(uri, functions);
        }
    }
    Object.defineProperties(this, {
        onError: { get: getOnError, set: setOnError },
        onerror: { get: getOnError, set: setOnError },
        ready: { get: getReady },
        uri: { get: getUri },
        timeout: { get: getTimeout, set: setTimeout },
        keepAlive: { get: getKeepAlive, set: setKeepAlive },
        byref: { get: getByRef, set: setByRef },
        simple: { get: getSimpleMode, set: setSimpleMode },
        useHarmonyMap: { get: getUseHarmonyMap, set: setUseHarmonyMap },
        options: { get: getOptions },
        setOption: { value: setOption },
        filter: { get: getFilter, set: setFilter },
        addFilter: { value: addFilter },
        removeFilter: { value: removeFilter },
        useService: { value: useService },
        invoke: { value: invoke },
        beginBatch: { value: beginBatch },
        endBatch: { value: endBatch },
        then: { get: getThen },
        catchError: { value: catchError }
    });
}

function create(uri, functions) {
    var protocol = parse(uri).protocol;
    if (protocol === 'http:' ||
        protocol === 'https:') {
        return new global.hprose.HttpClient(uri, functions);
    }
    if (protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:') {
        return new global.hprose.SocketClient(uri, functions);
    }
    if (protocol === 'ws:' ||
        protocol === 'wss:') {
        return new global.hprose.WebSocketClient(uri, functions);
    }
    throw new Error('The ' + protocol + ' client isn\'t implemented.');
}

Object.defineProperty(Client, 'create', { value: create });

util.inherits(Client, EventEmitter);

global.hprose.Client = Client;
