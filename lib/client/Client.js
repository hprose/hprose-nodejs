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
 * LastModified: Aug 20, 2017                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/* global Proxy */
'use strict';

var util = require('util');
var parse = require('url').parse;
var EventEmitter = require('events').EventEmitter;

var Tags = global.hprose.Tags;
var ResultMode = global.hprose.ResultMode;
var BytesIO = global.hprose.BytesIO;
var Writer = global.hprose.Writer;
var Reader = global.hprose.Reader;
var Future = global.hprose.Future;
var slice = Function.prototype.call.bind(Array.prototype.slice);
var isObjectEmpty = global.hprose.isObjectEmpty;

var GETFUNCTIONS = new Uint8Array(1);
GETFUNCTIONS[0] = Tags.TagEnd;

function noop(){}

var s_boolean = 'boolean';
var s_string = 'string';
var s_number = 'number';
var s_function = 'function';
var s_object = 'object';

function HproseOldProxy(setFunction, ns) {
    var settings = {};
    var target = {};
    this.get = function(proxy, name) {
        if (ns) { name = ns + '_' + name; }
        if (name === 'then') { return undefined; }
        if (!proxy.hasOwnProperty(name)) {
            settings[name] = {};
            var handler = new HproseOldProxy(setFunction, name);
            handler.set = function(proxy, prop, value) {
                settings[name][prop] = value;
                return true;
            };
            target[name] = Proxy.createFunction(handler, setFunction(settings, name));
        }
        return target[name];
    };
}

function HproseProxy(setFunction, ns) {
    var settings = {};
    this.get = function(target, prop, receiver) {
        var name = prop.toString();
        if (ns) { name = ns + '_' + name; }
        if (name === 'then') { return undefined; }
        if (!target.hasOwnProperty(name)) {
            settings[name] = {};
            var handler = new HproseProxy(setFunction, name);
            var func = setFunction(settings, name);
            handler.apply = function(target, thisArg, argumentsList) {
                return func.apply(null, argumentsList);
            }
            handler.set = function(target, prop, value, receiver) {
                settings[name][prop] = value;
                return true;
            };
            target[name] = new Proxy(function() {}, handler);
        }
        return target[name];
    };
}

function Client(uri, functions, settings) {
    EventEmitter.call(this);
    this.on('error', noop);

    // private members
    var _uri,
        _uriList                = [],
        _index                  = -1,
        _byref                  = false,
        _simple                 = false,
        _timeout                = 30000,
        _retry                  = 10,
        _idempotent             = false,
        _failswitch             = false,
        _failround              = 0,
        _lock                   = false,
        _tasks                  = [],
        _useHarmonyMap          = false,
        _onerror                = noop,
        _onfailswitch           = noop,
        _filters                = [],
        _batch                  = false,
        _batches                = [],
        _ready                  = new Future(),
        _topics                 = Object.create(null),
        _id                     = null,
        _keepAlive              = true,
        _invokeHandler          = invokeHandler,
        _batchInvokeHandler     = batchInvokeHandler,
        _beforeFilterHandler    = beforeFilterHandler,
        _afterFilterHandler     = afterFilterHandler,
        _invokeHandlers         = [],
        _batchInvokeHandlers    = [],
        _beforeFilterHandlers   = [],
        _afterFilterHandlers    = [],
        _options                = Object.create(null),

        self = this;

    function outputFilter(request, context) {
        for (var i = 0, n = _filters.length; i < n; i++) {
            request = _filters[i].outputFilter(request, context);
        }
        return request;
    }

    function inputFilter(response, context) {
        for (var i = _filters.length - 1; i >= 0; i--) {
            response = _filters[i].inputFilter(response, context);
        }
        return response;
    }

    function beforeFilterHandler(request, context) {
        request = outputFilter(request, context);
        return _afterFilterHandler(request, context)
        .then(function(response) {
            if (context.oneway) { return; }
            return inputFilter(response, context);
        });
    }

    function afterFilterHandler(request, context) {
         return self.sendAndReceive(request, context).catchError(function(e) {
             var response = retry(request, context);
             if (response !== null) {
                 return response;
             }
             throw e;
        });
    }

    function sendAndReceive(request, context, onsuccess, onerror) {
        _beforeFilterHandler(request, context).then(onsuccess, onerror);
    }

    function failswitch() {
        var n = _uriList.length;
        if (n > 1) {
            var i = _index + 1;
            if (i >= n) {
                i = 0;
                _failround++;
            }
            _index = i;
            _uri = _uriList[_index];
        }
        else {
            _failround++;
        }
        _onfailswitch(self);
        self.emit('failswitch', self);
    }

    function retry(data, context) {
        if (context.failswitch) {
            failswitch();
        }
        if (context.idempotent && (context.retried < context.retry)) {
            var interval = ++context.retried * 500;
            if (context.failswitch) {
                interval -= (_uriList.length - 1) * 500;
            }
            if (interval > 5000) {
                interval = 5000;
            }
            if (interval > 0) {
                return Future.delayed(interval, function() {
                    return afterFilterHandler(data, context);
                });
            }
            else {
                return afterFilterHandler(data, context);
            }
        }
        return null;
    }

    function initService(stub) {
        var context = {
            retry: _retry,
            retried: 0,
            idempotent: true,
            failswitch: true,
            timeout: _timeout,
            client: self,
            userdata: {}
        };
        var onsuccess = function(data) {
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
                _ready.reject(error);
            }
            else {
                _ready.resolve(stub);
            }
        };
        sendAndReceive(GETFUNCTIONS, context, onsuccess, _ready.reject);
    }

    function setFunction(stub, name) {
        return function() {
            if (_batch) {
                return _invoke(stub, name, slice(arguments), true);
            }
            else {
                return Future.all(arguments).then(function(args) {
                    return _invoke(stub, name, args, false);
                });
            }
        };
    }

    function setMethods(stub, obj, namespace, name, methods) {
        if (obj[name] !== undefined) { return; }
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
                        setMethods(stub, obj[name], namespace + name + '_', n, m[n]);
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
    }

    function copyargs(src, dest) {
        var n = Math.min(src.length, dest.length);
        for (var i = 0; i < n; ++i) { dest[i] = src[i]; }
    }

    function initContext(batch) {
        if (batch) {
            return {
                mode: ResultMode.Normal,
                byref: _byref,
                simple: _simple,
                onsuccess: undefined,
                onerror: undefined,
                useHarmonyMap: _useHarmonyMap,
                client: self,
                userdata: {}
            };
        }
        return {
            mode: ResultMode.Normal,
            byref: _byref,
            simple: _simple,
            timeout: _timeout,
            retry: _retry,
            retried: 0,
            idempotent: _idempotent,
            failswitch: _failswitch,
            oneway: false,
            sync: false,
            onsuccess: undefined,
            onerror: undefined,
            useHarmonyMap: _useHarmonyMap,
            client: self,
            userdata: {}
        };
    }

    function getContext(stub, name, args, batch) {
        var context = initContext(batch);
        if (name in stub) {
            var method = stub[name];
            for (var key in method) {
                if (key in context) {
                    context[key] = method[key];
                }
            }
        }
        var i = 0, n = args.length;
        for (; i < n; ++i) {
            if (typeof args[i] === s_function) { break; }
        }
        if (i === n) { return context; }
        var extra = args.splice(i, n - i);
        context.onsuccess = extra[0];
        n = extra.length;
        for (i = 1; i < n; ++i) {
            var arg = extra[i];
            switch (typeof arg) {
            case s_function:
                context.onerror = arg; break;
            case s_boolean:
                context.byref = arg; break;
            case s_number:
                context.mode = arg; break;
            case s_object:
                for (var k in arg) {
                    if (k in context) {
                        context[k] = arg[k];
                    }
                }
                break;
            }
        }
        return context;
    }

    function encode(name, args, context) {
        var stream = new BytesIO();
        stream.writeByte(Tags.TagCall);
        var writer = new Writer(stream, context.simple);
        writer.writeString(name);
        if (args.length > 0 || context.byref) {
            writer.reset();
            writer.writeList(args);
            if (context.byref) {
                writer.writeBoolean(true);
            }
        }
        return stream;
    }

    function __invoke(name, args, context, batch) {
        if (_lock) {
            return Future.promise(function(resolve, reject) {
                _tasks.push({
                    batch: batch,
                    name: name,
                    args: args,
                    context: context,
                    resolve: resolve,
                    reject: reject
                });
            });
        }
        if (batch) {
            return multicall(name, args, context);
        }
        return call(name, args, context);
    }

    function _invoke(stub, name, args, batch) {
        return __invoke(name, args, getContext(stub, name, args, batch), batch);
    }

    function errorHandling(name, error, context, reject) {
        try {
            if (context.onerror) {
                context.onerror(name, error);
            }
            else {
                _onerror(name, error);
                self.emit('error', name, error);
            }
            reject(error);
        }
        catch (e) {
            reject(e);
        }
    }

    function invokeHandler(name, args, context) {
        var request = encode(name, args, context);
        request.writeByte(Tags.TagEnd);
        return Future.promise(function(resolve, reject) {
            sendAndReceive(request.bytes, context, function(response) {
                if (context.oneway) {
                    resolve();
                    return;
                }
                var result = null;
                var error = null;
                try {
                    if (context.mode === ResultMode.RawWithEndTag) {
                        result = response;
                    }
                    else if (context.mode === ResultMode.Raw) {
                        result = response.subarray(0, response.byteLength - 1);
                    }
                    else {
                        var stream = new BytesIO(response);
                        var reader = new Reader(stream, false, context.useHarmonyMap);
                        var tag = stream.readByte();
                        if (tag === Tags.TagResult) {
                            if (context.mode === ResultMode.Serialized) {
                                result = reader.readRaw();
                            }
                            else {
                                result = reader.unserialize();
                            }
                            tag = stream.readByte();
                            if (tag === Tags.TagArgument) {
                                reader.reset();
                                var _args = reader.readList();
                                copyargs(_args, args);
                                tag = stream.readByte();
                            }
                        }
                        else if (tag === Tags.TagError) {
                            error = new Error(reader.readString());
                            tag = stream.readByte();
                        }
                        if (tag !== Tags.TagEnd) {
                            error = new Error('Wrong Response:\r\n' + BytesIO.toString(response));
                        }
                    }
                }
                catch (e) {
                    error = e;
                }
                if (error) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            }, reject);
        });
    }

    function unlock(sync) {
        return function() {
            if (sync) {
                _lock = false;
                process.nextTick(function(tasks) {
                    tasks.forEach(function(task) {
                        if ('settings' in task) {
                            endBatch(task.settings)
                            .then(task.resolve, task.reject);
                        }
                        else {
                            __invoke(task.name, task.args, task.context, task.batch).then(task.resolve, task.reject);
                        }
                    });
                }, _tasks);
                _tasks = [];
            }
        };
    }

    function call(name, args, context) {
        if (context.sync) { _lock = true; }
        var promise = Future.promise(function(resolve, reject) {
            _invokeHandler(name, args, context).then(function(result) {
                try {
                    if (context.onsuccess) {
                        try {
                            context.onsuccess(result, args);
                        }
                        catch (e) {
                            if (context.onerror) {
                                context.onerror(name, e);
                            }
                            reject(e);
                        }
                    }
                    resolve(result);
                }
                catch (e) {
                    reject(e);
                }
            }, function(error) {
                errorHandling(name, error, context, reject);
            });
        });
        promise.whenComplete(unlock(context.sync));
        return promise;
    }

    function multicall(name, args, context) {
        return Future.promise(function(resolve, reject) {
            _batches.push({
                args: args,
                name: name,
                context: context,
                resolve: resolve,
                reject: reject
            });
        });
    }

    function getBatchContext(settings) {
        var context = {
            timeout: _timeout,
            retry: _retry,
            retried: 0,
            idempotent: _idempotent,
            failswitch: _failswitch,
            oneway: false,
            sync: false,
            client: self,
            userdata: {}
        };
        for (var k in settings) {
            if (k in context) {
                context[k] = settings[k];
            }
        }
        return context;
    }

    function batchInvokeHandler(batches, context) {
        var request = batches.reduce(function(stream, item) {
            stream.write(encode(item.name, item.args, item.context));
            return stream;
        }, new BytesIO());
        request.writeByte(Tags.TagEnd);
        return Future.promise(function(resolve, reject) {
            sendAndReceive(request.bytes, context, function(response) {
                if (context.oneway) {
                    resolve(batches);
                    return;
                }
                var i = -1;
                var stream = new BytesIO(response);
                var reader = new Reader(stream, false);
                var tag = stream.readByte();
                try {
                    while (tag !== Tags.TagEnd) {
                        var result = null;
                        var error = null;
                        var mode = batches[++i].context.mode;
                        if (mode >= ResultMode.Raw) {
                            result = new BytesIO();
                        }
                        if (tag === Tags.TagResult) {
                            if (mode === ResultMode.Serialized) {
                                result = reader.readRaw();
                            }
                            else if (mode >= ResultMode.Raw) {
                                result.writeByte(Tags.TagResult);
                                result.write(reader.readRaw());
                            }
                            else {
                                reader.useHarmonyMap = batches[i].context.useHarmonyMap;
                                reader.reset();
                                result = reader.unserialize();
                            }
                            tag = stream.readByte();
                            if (tag === Tags.TagArgument) {
                                if (mode >= ResultMode.Raw) {
                                    result.writeByte(Tags.TagArgument);
                                    result.write(reader.readRaw());
                                }
                                else {
                                    reader.reset();
                                    var _args = reader.readList();
                                    copyargs(_args, batches[i].args);
                                }
                                tag = stream.readByte();
                            }
                        }
                        else if (tag === Tags.TagError) {
                            if (mode >= ResultMode.Raw) {
                                result.writeByte(Tags.TagError);
                                result.write(reader.readRaw());
                            }
                            else {
                                reader.reset();
                                error = new Error(reader.readString());
                            }
                            tag = stream.readByte();
                        }
                        if ([Tags.TagEnd,
                             Tags.TagResult,
                             Tags.TagError].indexOf(tag) < 0) {
                            reject(new Error('Wrong Response:\r\n' + BytesIO.toString(response)));
                            return;
                        }
                        if (mode >= ResultMode.Raw) {
                            if (mode === ResultMode.RawWithEndTag) {
                                result.writeByte(Tags.TagEnd);
                            }
                            batches[i].result = result.bytes;
                        }
                        else {
                            batches[i].result = result;
                        }
                        batches[i].error = error;
                    }
                }
                catch (e) {
                    reject(e);
                    return;
                }
                resolve(batches);
            }, reject);
        });
    }

    function beginBatch() {
        _batch = true;
    }

    function endBatch(settings) {
        settings = settings || {};
        _batch = false;
        if (_lock) {
            return Future.promise(function(resolve, reject) {
                _tasks.push({
                    batch: true,
                    settings: settings,
                    resolve: resolve,
                    reject: reject
                });
            });
        }
        var batchSize = _batches.length;
        if (batchSize === 0) { return Future.value([]); }
        var context = getBatchContext(settings);
        if (context.sync) { _lock = true; }
        var batches = _batches;
        _batches = [];
        var promise = Future.promise(function(resolve, reject) {
            _batchInvokeHandler(batches, context).then(function(batches) {
                batches.forEach(function(i) {
                    if (i.error) {
                        errorHandling(i.name, i.error, i.context, i.reject);
                    }
                    else {
                        try {
                            if (i.context.onsuccess) {
                                try {
                                    i.context.onsuccess(i.result, i.args);
                                }
                                catch (e) {
                                    if (i.context.onerror) {
                                        i.context.onerror(i.name, e);
                                    }
                                    i.reject(e);
                                }
                            }
                            i.resolve(i.result);
                        }
                        catch (e) {
                            i.reject(e);
                        }
                    }
                    delete i.context;
                    delete i.resolve;
                    delete i.reject;
                });
                resolve(batches);
            }, function(error) {
                batches.forEach(function(i) {
                    if ('reject' in i) {
                        errorHandling(i.name, error, i.context, i.reject);
                    }
                });
                reject(error);
            });
        });
        promise.whenComplete(unlock(context.sync));
        return promise;
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
    function getOnFailswitch() {
        return _onfailswitch;
    }
    function setOnFailswitch(value) {
        if (typeof(value) === s_function) {
            _onfailswitch = value;
        }
    }
    function getUri() {
        return _uri;
    }
    function getUriList() {
        return _uriList;
    }
    function setUriList(uriList) {
        if (typeof(uriList) === s_string) {
            _uriList = [uriList];
        }
        else if (Array.isArray(uriList)) {
            _uriList = uriList.slice(0);
            _uriList.sort(function() { return Math.random() - 0.5; });
        }
        else {
            return;
        }
        _index = 0;
        _uri = _uriList[_index];
    }
    function getFailswitch() {
        return _failswitch;
    }
    function setFailswitch(value) {
        _failswitch = !!value;
    }
    function getFailround() {
        return _failround;
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
    function getRetry() {
        return _retry;
    }
    function setRetry(value) {
        if (typeof(value) === 'number') {
            _retry = value | 0;
        }
        else {
            _retry = 0;
        }
    }
    function getIdempotent() {
        return _idempotent;
    }
    function setIdempotent(value) {
        _idempotent = !!value;
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
    function setOptions(options) {
        for (var option in options) {
            setOption(option, options[option]);
        }
    }
    function getFilter() {
        if (_filters.length === 0) {
            return null;
        }
        if (_filters.length === 1) {
            return _filters[0];
        }
        return _filters.slice();
    }
    function setFilter(filter) {
        _filters.length = 0;
        if (Array.isArray(filter)) {
            filter.forEach(function(filter) {
                addFilter(filter);
            });
        }
        else {
            addFilter(filter);
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
    function filters() {
        return _filters;
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
            if (typeof(Proxy) === 'undefined') {
                process.nextTick(initService, stub);
                return _ready;
            }
            if ('create' in Proxy) {
                stub = Proxy.create(new HproseOldProxy(setFunction));
            }
            else {
                stub = new Proxy({}, new HproseProxy(setFunction));
            }
        }
        _ready.resolve(stub);
        return stub;
    }
    function invoke(name, args, onsuccess/*, onerror, settings*/) {
        var argc = arguments.length;
        if ((argc < 1) || (typeof name !== s_string)) {
            throw new Error('name must be a string');
        }
        if (argc === 1) { args = []; }
        if (argc === 2) {
            if (!Array.isArray(args)) {
                var _args = [];
                if (typeof args !== s_function) {
                    _args.push(noop);
                }
                _args.push(args);
                args = _args;
            }
        }
        if (argc > 2) {
            if (typeof onsuccess !== s_function) {
                args.push(noop);
            }
            for (var i = 2; i < argc; i++) {
                args.push(arguments[i]);
            }
        }
        return _invoke(self, name, args, _batch);
    }
    function ready(onComplete, onError) {
        return _ready.then(onComplete, onError);
    }
    function getTopic(name, id) {
        if (_topics[name]) {
            var topics = _topics[name];
            if (topics[id]) {
                return topics[id];
            }
        }
        return null;
    }
    // subscribe(name, callback, timeout, failswitch)
    // subscribe(name, id, callback, timeout, failswitch)
    function subscribe(name, id, callback, timeout, failswitch) {
        if (typeof name !== s_string) {
            throw new TypeError('topic name must be a string.');
        }
        if (id === undefined || id === null) {
            if (typeof callback === s_function) {
                id = callback;
            }
            else {
                throw new TypeError('callback must be a function.');
            }
        }
        if (!_topics[name]) {
            _topics[name] = Object.create(null);
        }
        if (typeof id === s_function) {
            timeout = callback;
            callback = id;
            autoId().then(function(id) {
                subscribe(name, id, callback, timeout, failswitch);
            });
            return;
        }
        if (typeof callback !== s_function) {
            throw new TypeError('callback must be a function.');
        }
        if (Future.isPromise(id)) {
            id.then(function(id) {
                subscribe(name, id, callback, timeout, failswitch);
            });
            return;
        }
        // Default subscribe timeout is 5 minutes.
        if (timeout === undefined) { timeout = 300000; }
        var topic = getTopic(name, id);
        if (topic === null) {
            var cb = function() {
                _invoke(self, name, [id, topic.handler, cb, {
                    idempotent: true,
                    failswitch: failswitch,
                    timeout: timeout
                }], false);
            };
            topic = {
                handler: function(result) {
                    var topic = getTopic(name, id);
                    if (topic) {
                        if (result !== null) {
                            var callbacks = topic.callbacks;
                            for (var i = 0, n = callbacks.length; i < n; ++i) {
                                try {
                                    callbacks[i](result);
                                }
                                catch (e) {}
                            }
                        }
                        if (getTopic(name, id) !== null) { cb(); }
                    }
                },
                callbacks: [callback]
            };
            _topics[name][id] = topic;
            cb();
        }
        else if (topic.callbacks.indexOf(callback) < 0) {
            topic.callbacks.push(callback);
        }
    }
    function delTopic(topics, id, callback) {
        if (topics) {
            if (typeof callback === s_function) {
                var topic = topics[id];
                if (topic) {
                    var callbacks = topic.callbacks;
                    var p = callbacks.indexOf(callback);
                    if (p >= 0) {
                        callbacks[p] = callbacks[callbacks.length - 1];
                        callbacks.length--;
                    }
                    if (callbacks.length === 0) {
                        delete topics[id];
                    }
                }
            }
            else {
                delete topics[id];
            }
        }
    }
    // unsubscribe(name)
    // unsubscribe(name, callback)
    // unsubscribe(name, id)
    // unsubscribe(name, id, callback)
    function unsubscribe(name, id, callback) {
        if (typeof name !== s_string) {
            throw new TypeError('topic name must be a string.');
        }
        if (id === undefined || id === null) {
            if (typeof callback === s_function) {
                id = callback;
            }
            else {
                delete _topics[name];
                return;
            }
        }
        if (typeof id === s_function) {
            callback = id;
            id = null;
        }
        if (id === null) {
            if (_id === null) {
                if (_topics[name]) {
                    var topics = _topics[name];
                    for (id in topics) {
                        delTopic(topics, id, callback);
                    }
                }
            }
            else {
                _id.then(function(id) {
                    unsubscribe(name, id, callback);
                });
            }
        }
        else if (Future.isPromise(id)) {
            id.then(function(id) {
                unsubscribe(name, id, callback);
            });
        }
        else {
            delTopic(_topics[name], id, callback);
        }
        if (isObjectEmpty(_topics[name])) {
            delete _topics[name];
        }
    }
    function isSubscribed(name) {
        return !!_topics[name];
    }
    function subscribedList() {
        var list = [];
        for (var name in _topics) {
            list.push(name);
        }
        return list;
    }
    function getId() {
        return _id;
    }
    function autoId() {
        if (_id === null) {
            _id = _invoke(self, '#', [], false);
        }
        return _id;
    }
    autoId.sync = true;
    autoId.idempotent = true;
    autoId.failswitch = true;
    function addInvokeHandler(handler) {
        _invokeHandlers.push(handler);
        _invokeHandler = _invokeHandlers.reduceRight(
        function(next, handler) {
            return function(name, args, context) {
                return Future.toPromise(handler(name, args, context, next));
            };
        }, invokeHandler);
    }
    function addBatchInvokeHandler(handler) {
        _batchInvokeHandlers.push(handler);
        _batchInvokeHandler = _batchInvokeHandlers.reduceRight(
        function(next, handler) {
            return function(batches, context) {
                return Future.toPromise(handler(batches, context, next));
            };
        }, batchInvokeHandler);
    }
    function addBeforeFilterHandler(handler) {
        _beforeFilterHandlers.push(handler);
        _beforeFilterHandler = _beforeFilterHandlers.reduceRight(
        function(next, handler) {
            return function(request, context) {
                return Future.toPromise(handler(request, context, next));
            };
        }, beforeFilterHandler);
    }
    function addAfterFilterHandler(handler) {
        _afterFilterHandlers.push(handler);
        _afterFilterHandler = _afterFilterHandlers.reduceRight(
        function(next, handler) {
            return function(request, context) {
                return Future.toPromise(handler(request, context, next));
            };
        }, afterFilterHandler);
    }
    function use(handler) {
        addInvokeHandler(handler);
        return self;
    }
    var batch = Object.create(null, {
        begin: { value: beginBatch },
        end: { value: endBatch },
        use: { value: function(handler) {
            addBatchInvokeHandler(handler);
            return batch;
        } }
    });
    var beforeFilter = Object.create(null, {
        use: { value: function(handler) {
            addBeforeFilterHandler(handler);
            return beforeFilter;
        } }
    });
    var afterFilter = Object.create(null, {
        use: { value: function(handler) {
            addAfterFilterHandler(handler);
            return afterFilter;
        } }
    });
    Object.defineProperties(this, {
        '#': { value: autoId },
        onerror: { get: getOnError, set: setOnError },
        onfailswitch: { get: getOnFailswitch, set: setOnFailswitch },
        uri: { get: getUri },
        uriList: { get: getUriList, set: setUriList },
        id: { get: getId },
        failswitch: { get: getFailswitch, set: setFailswitch },
        failround: { get: getFailround },
        timeout: { get: getTimeout, set: setTimeout },
        retry: { get: getRetry, set: setRetry },
        idempotent: { get: getIdempotent, set: setIdempotent },
        keepAlive: { get: getKeepAlive, set: setKeepAlive },
        byref: { get: getByRef, set: setByRef },
        simple: { get: getSimpleMode, set: setSimpleMode },
        useHarmonyMap: { get: getUseHarmonyMap, set: setUseHarmonyMap },
        options: { get: getOptions, set: setOptions },
        setOption: { value: setOption },
        filter: { get: getFilter, set: setFilter },
        addFilter: { value: addFilter },
        removeFilter: { value: removeFilter },
        filters: { get: filters },
        useService: { value: useService },
        invoke: { value: invoke },
        ready: { value: ready },
        subscribe: {value: subscribe },
        unsubscribe: {value: unsubscribe },
        isSubscribed: { value : isSubscribed },
        subscribedList: { value : subscribedList },
        use: { value: use },
        batch: { value: batch },
        beforeFilter: { value: beforeFilter },
        afterFilter: { value: afterFilter }
    });
    /* function constructor */ {
        if ((settings) && (typeof settings === s_object)) {
            ['failswitch', 'timeout', 'retry', 'idempotent',
             'keepAlive', 'byref', 'simple','useHarmonyMap',
             'filter', 'options'].forEach(function(key) {
                 if (key in settings) {
                     self[key] = settings[key];
                 }
            });
        }
        if (uri) {
            setUriList(uri);
            useService(functions);
        }
    }
}

function checkuri(uri) {
    var protocol = parse(uri).protocol;
    if (protocol === 'http:' ||
        protocol === 'https:' ||
        protocol === 'tcp:' ||
        protocol === 'tcp4:'||
        protocol === 'tcp6:' ||
        protocol === 'tcps:' ||
        protocol === 'tcp4s:' ||
        protocol === 'tcp6s:' ||
        protocol === 'tls:' ||
        protocol === 'unix:' ||
        protocol === 'ws:' ||
        protocol === 'wss:') {
        return;
    }
    throw new Error('The ' + protocol + ' client isn\'t implemented.');
}

function create(uri, functions, settings) {
    try {
        return global.hprose.HttpClient.create(uri, functions, settings);
    }
    catch(e) {}
    try {
        return global.hprose.SocketClient.create(uri, functions, settings);
    }
    catch(e) {}
    try {
        return global.hprose.WebSocketClient.create(uri, functions, settings);
    }
    catch(e) {}
    if (typeof uri === 'string') {
        checkuri(uri);
    }
    else if (Array.isArray(uri)) {
        uri.forEach(function(uri) { checkuri(uri); });
        throw new Error('Not support multiple protocol.');
    }
    throw new Error('You should set server uri first!');
}

Object.defineProperty(Client, 'create', { value: create });

util.inherits(Client, EventEmitter);

global.hprose.Client = Client;
